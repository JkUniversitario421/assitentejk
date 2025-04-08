const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const porta = process.env.PORT || 3000;
app.use(bodyParser.json());

const URL_SHEETDB_ENCOMENDAS = 'https://sheetdb.io/api/v1/g6f3ljg6px6yr';
const URL_SHEETDB_LUZ = 'https://sheetdb.io/api/v1/5m0rz0rmv8jmg';

let estadosUsuarios = {};

// Só ativa o bot se houver palavras-chave de interesse
function verificaPalavrasChave(texto) {
  const palavrasChave = [
    'encomenda', 'entrega', 'chegou', 'chegar', 'chegada',
    'recebi', 'recebida', 'recebido', 'entregou', 'trouxe',
    'vai chegar', 'foi entregue', 'pode receber', 'confirmar recebimento'
  ];
  return palavrasChave.some(palavra => texto.includes(palavra));
}

app.post('/webhook', async (req, res) => {
  const idSessao = req.body.session || 'default';
  const textoUsuario = req.body.queryResult.queryText?.toLowerCase() || '';
  const parametros = req.body.queryResult.parameters;
  const escolha = parseInt(textoUsuario, 10);
  let respostaTexto = '';

  if (!estadosUsuarios[idSessao] && !verificaPalavrasChave(textoUsuario)) {
    // Ignora mensagens não relacionadas
    return res.json({ fulfillmentText: '' });
  }

  if (!estadosUsuarios[idSessao]) {
    estadosUsuarios[idSessao] = { etapa: 'menu' };
  }

  const estadoUsuario = estadosUsuarios[idSessao];

  try {
    switch (estadoUsuario.etapa) {
      case 'menu':
      case 'aguardandoEscolha':
        if (!isNaN(escolha)) {
          if (escolha === 0) {
            respostaTexto = 'Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento';
            estadoUsuario.etapa = 'aguardandoEscolha';
          } else if (escolha === 1) {
            estadoUsuario.etapa = 'obterNome';
            respostaTexto = 'Qual o seu nome?';
          } else if (escolha === 2) {
            const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
            respostaTexto = data.length
              ? data.map(e => `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}${e.recebido_por ? `\nRecebido por: ${e.recebido_por}` : ''}`).join('\n\n')
              : 'Nenhuma encomenda encontrada.';
            delete estadosUsuarios[idSessao];
          } else if (escolha === 3) {
            estadoUsuario.etapa = 'confirmarNome';
            respostaTexto = 'De quem é essa encomenda?';
          } else {
            respostaTexto = 'Opção inválida. Escolha entre 1, 2 ou 3.';
          }
        } else {
          if (verificaPalavrasChave(textoUsuario)) {
            respostaTexto = 'Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento';
            estadoUsuario.etapa = 'aguardandoEscolha';
          } else {
            respostaTexto = '';
          }
        }
        break;

      case 'obterNome':
        estadoUsuario.nome = textoUsuario;
        estadoUsuario.etapa = 'obterData';
        respostaTexto = 'Qual a data estimada de entrega? (Ex: dia/mês/ano)';
        break;

      case 'obterData':
        estadoUsuario.data = textoUsuario;
        estadoUsuario.etapa = 'obterLocal';
        respostaTexto = 'Onde a compra foi realizada? (Ex: Amazon, Mercado Livre)';
        break;

      case 'obterLocal':
        estadoUsuario.local = textoUsuario;
        await axios.post(URL_SHEETDB_ENCOMENDAS, [{
          nome: estadoUsuario.nome,
          data: estadoUsuario.data,
          local: estadoUsuario.local,
          status: 'Aguardando Recebimento'
        }]);
        respostaTexto = `Ok, ${estadoUsuario.nome}! Sua encomenda está registrada para o dia ${estadoUsuario.data}, compra feita em ${estadoUsuario.local}.`;
        delete estadosUsuarios[idSessao];
        break;

      case 'confirmarNome':
        estadoUsuario.nomeConfirmado = textoUsuario;
        estadoUsuario.etapa = 'confirmarRecebedor';
        respostaTexto = 'Quem está recebendo a encomenda?';
        break;

      case 'confirmarRecebedor':
        const recebidoPor = textoUsuario;
        const { data: lista } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = lista.find(e => e.nome === estadoUsuario.nomeConfirmado && e.status === 'Aguardando Recebimento');

        if (encomenda) {
          await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/nome/${encodeURIComponent(estadoUsuario.nomeConfirmado)}`, {
            status: 'Recebida',
            recebido_por: recebidoPor
          });
          respostaTexto = `Recebimento confirmado! ${estadoUsuario.nomeConfirmado} recebeu sua encomenda, registrada por ${recebidoPor}.`;
        } else {
          respostaTexto = `Nenhuma encomenda pendente encontrada para ${estadoUsuario.nomeConfirmado}.`;
        }
        delete estadosUsuarios[idSessao];
        break;

      default:
        respostaTexto = 'Algo deu errado. Tente novamente.';
        delete estadosUsuarios[idSessao];
    }
  } catch (erro) {
    console.error('Erro:', erro.message);
    respostaTexto = 'Houve um problema ao processar sua solicitação.';
    delete estadosUsuarios[idSessao];
  }

  res.json({ fulfillmentText: respostaTexto });
});

app.listen(porta, () => {
  console.log(`Assistente rodando na porta ${porta}`);
});
