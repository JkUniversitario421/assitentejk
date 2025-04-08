const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const porta = process.env.PORT || 3000;
app.use(bodyParser.json());

const URL_SHEETDB_ENCOMENDAS = 'https://sheetdb.io/api/v1/g6f3ljg6px6yr';
const URL_SHEETDB_LUZ = 'https://sheetdb.io/api/v1/5m0rz0rmv8jmg';

let estadosUsuarios = {};

function verificaPalavrasChave(texto) {
  const palavrasChave = ['entrega', 'entregou', 'chegou', 'recebi', 'encomenda', 'correio', 'receberam'];
  return palavrasChave.some(p => texto.includes(p));
}

app.post('/webhook', async (req, res) => {
  const idSessao = req.body.session || 'default';
  const textoUsuario = req.body.queryResult.queryText?.toLowerCase() || '';
  const parametros = req.body.queryResult.parameters;
  const escolha = parseInt(textoUsuario, 10);
  let respostaTexto = '';

  // Ativa apenas se houver palavra-chave
  if (!estadosUsuarios[idSessao]) {
    if (!verificaPalavrasChave(textoUsuario)) {
      return res.json({ fulfillmentText: '' });
    }
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
          } else if (escolha === 4) {
            estadoUsuario.etapa = 'obterNomeLuz';
            respostaTexto = 'Qual o seu nome para registrar a conta de luz?';
          } else {
            respostaTexto = 'Opção inválida. Escolha entre 0, 1, 2, 3 ou 4';
          }
        } else {
          if (textoUsuario.includes('encomenda')) {
            respostaTexto = 'Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento';
            estadoUsuario.etapa = 'aguardandoEscolha';
          } else if (textoUsuario.includes('consultar')) {
            const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
            respostaTexto = data.length
              ? data.map(e => `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}${e.recebido_por ? `\nRecebido por: ${e.recebido_por}` : ''}`).join('\n\n')
              : 'Nenhuma encomenda encontrada.';
            delete estadosUsuarios[idSessao];
          } else if (textoUsuario.includes('confirmar') || textoUsuario.includes('recebi')) {
            estadoUsuario.etapa = 'confirmarNome';
            respostaTexto = 'De quem é essa encomenda?';
          } else {
            respostaTexto = 'Opção inválida. Escolha entre 0, 1, 2, 3 ou 4';
          }
        }
        break;

      case 'obterNome':
        estadoUsuario.nome = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'obterData';
        respostaTexto = 'Qual a data estimada de entrega? (Ex: dia/mês/ano)';
        break;

      case 'obterData':
        estadoUsuario.data = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'obterLocal';
        respostaTexto = 'Onde a compra foi realizada? (Ex: Amazon, Mercado Livre, Farmácia Delivery)';
        break;

      case 'obterLocal':
        estadoUsuario.local = req.body.queryResult.queryText;
        await axios.post(URL_SHEETDB_ENCOMENDAS, [{
          nome: estadoUsuario.nome,
          data: estadoUsuario.data,
          local: estadoUsuario.local,
          status: 'Aguardando Recebimento'
        }]);
        respostaTexto = `Ok, ${estadoUsuario.nome}! Sua encomenda chegará no dia ${estadoUsuario.data} e foi comprada em ${estadoUsuario.local}.`;
        delete estadosUsuarios[idSessao];
        break;

      case 'confirmarNome':
        estadoUsuario.nomeConfirmado = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'confirmarRecebedor';
        respostaTexto = 'Quem está recebendo a encomenda?';
        break;

      case 'confirmarRecebedor':
        const recebidoPor = req.body.queryResult.queryText;
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

      case 'obterNomeLuz':
        estadoUsuario.nome = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'obterValorLuz';
        respostaTexto = 'Qual o valor da conta de luz?';
        break;

      case 'obterValorLuz':
        await axios.post(URL_SHEETDB_LUZ, [{
          nome: estadoUsuario.nome,
          valor: req.body.queryResult.queryText
        }]);
        respostaTexto = `Conta de luz registrada:\nNome: ${estadoUsuario.nome}\nValor: R$ ${req.body.queryResult.queryText}`;
        delete estadosUsuarios[idSessao];
        break;

      default:
        respostaTexto = 'Algo deu errado, tente novamente.';
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error('Erro:', error);
    respostaTexto = 'Ocorreu um erro, tente novamente mais tarde.';
    delete estadosUsuarios[idSessao];
  }

  res.json({ fulfillmentText: respostaTexto });
});

app.listen(porta, () => {
  console.log(`Assistente virtual rodando na porta ${porta}`);
});
