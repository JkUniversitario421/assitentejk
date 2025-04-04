const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const porta = process.env.PORT || 3000;
app.use(bodyParser.json());

const URL_SHEETDB_ENCOMENDAS = 'https://sheetdb.io/api/v1/g6f3ljg6px6yr';
const URL_SHEETDB_LUZ = 'https://sheetdb.io/api/v1/5m0rz0rmv8jmg';

let estadosUsuarios = {};

app.post('/webhook', async (req, res) => {
  const idSessao = req.body.session || 'default';
  const textoUsuario = req.body.queryResult.queryText;
  const parametros = req.body.queryResult.parameters;

  if (!estadosUsuarios[idSessao]) {
    estadosUsuarios[idSessao] = { etapa: 'aguardandoEscolha' };
  }

  const estadoUsuario = estadosUsuarios[idSessao];
  let respostaTexto = '';

  try {
    switch (estadoUsuario.etapa) {
      case 'aguardandoEscolha':
        const escolha = parseInt(textoUsuario, 10);

        if (textoUsuario === '0') {
          respostaTexto = 'Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento\n4. Registrar Conta de Luz';
        } else if (escolha === 1) {
          estadoUsuario.etapa = 'obterNome';
          respostaTexto = 'Qual o seu nome?';
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          if (data.length) {
            respostaTexto = data.map(e => {
              const recebidoPor = e.recebido_por ? `\nRecebido por: ${e.recebido_por}` : '';
              return `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}${recebidoPor}`;
            }).join('\n\n');
          } else {
            respostaTexto = 'Nenhuma encomenda encontrada.';
          }
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
        break;

      case 'obterNome':
        estadoUsuario.nome = textoUsuario;
        estadoUsuario.etapa = 'obterData';
        respostaTexto = 'Qual a data estimada de entrega? (Ex: 18/03/2025)';
        break;

      case 'obterData':
        estadoUsuario.data = textoUsuario;
        estadoUsuario.etapa = 'obterLocal';
        respostaTexto = 'Onde a compra foi realizada? (Ex: Amazon, Mercado Livre, Farmácia Delivery)';
        break;

      case 'obterLocal':
        estadoUsuario.local = textoUsuario;
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
        estadoUsuario.nomeEncomenda = textoUsuario;
        estadoUsuario.etapa = 'confirmarRecebedor';
        respostaTexto = 'Qual o seu nome (quem está recebendo)?';
        break;

      case 'confirmarRecebedor':
        const nomeEncomenda = estadoUsuario.nomeEncomenda;
        const nomeRecebedor = textoUsuario;
        const { data: encomendas } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = encomendas.find(e => e.nome === nomeEncomenda && e.status === 'Aguardando Recebimento');

        if (encomenda) {
          await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/nome/${encodeURIComponent(nomeEncomenda)}`, {
            status: 'Recebida',
            recebido_por: nomeRecebedor
          });
          respostaTexto = `Recebimento confirmado!\nEncomenda de ${nomeEncomenda} recebida por ${nomeRecebedor}.`;
        } else {
          respostaTexto = `Nenhuma encomenda pendente encontrada para ${nomeEncomenda}.`;
        }
        delete estadosUsuarios[idSessao];
        break;

      case 'obterNomeLuz':
        estadoUsuario.nome = textoUsuario;
        estadoUsuario.etapa = 'obterValorLuz';
        respostaTexto = 'Qual o valor da conta de luz?';
        break;

      case 'obterValorLuz':
        await axios.post(URL_SHEETDB_LUZ, [{
          nome: estadoUsuario.nome,
          valor: textoUsuario
        }]);
        respostaTexto = `Conta de luz registrada:\nNome: ${estadoUsuario.nome}\nValor: R$ ${textoUsuario}`;
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
