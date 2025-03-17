const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.json());

const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/YOUR_SHEETDB_ID';

let userStates = {};

app.post('/webhook', async (req, res) => {
  const sessionId = req.body.session || 'default';
  const intent = req.body.queryResult.intent.displayName;
  const parameters = req.body.queryResult.parameters;
  const choice = parseInt(req.body.queryResult.queryText) || parameters.number || parameters.opcao;
  let responseText = '';

  if (!userStates[sessionId]) {
    userStates[sessionId] = { stage: 'menu' };
  }

  const userState = userStates[sessionId];

  try {
    switch (userState.stage) {
      case 'menu':
        responseText = 'Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento';
        userState.stage = 'awaitingChoice';
        break;

      case 'awaitingChoice':
        if (choice === 1) {
          userState.stage = 'getName';
          responseText = 'Qual o seu nome?';
        } else if (choice === 2) {
          const { data } = await axios.get(SHEETDB_API_URL);
          responseText = data.length ? data.map(e => `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}`).join('\n\n') : 'Nenhuma encomenda encontrada.';
          delete userStates[sessionId];
        } else if (choice === 3) {
          userState.stage = 'confirmName';
          responseText = 'Qual o seu nome para confirmar o recebimento?';
        } else {
          responseText = 'Opção inválida. Escolha entre 1, 2 ou 3.';
        }
        break;

      case 'getName':
        if (!parameters['nome']) {
          responseText = 'Por favor, informe seu nome.';
        } else {
          userState.nome = parameters['nome'];
          userState.stage = 'getDate';
          responseText = 'Qual a data estimada de entrega? (Ex: 18/03/2025)';
        }
        break;

      case 'getDate':
        if (!parameters['date']) {
          responseText = 'Por favor, informe a data estimada de entrega.';
        } else {
          userState.data = parameters['date'];
          userState.stage = 'getLocal';
          responseText = 'Onde a compra foi realizada? (Ex: Amazon, Mercado Livre, Farmácia Delivery)';
        }
        break;

      case 'getLocal':
        if (!parameters['local']) {
          responseText = 'Por favor, informe onde a compra foi realizada.';
        } else {
          userState.local = parameters['local'];
          await axios.post(SHEETDB_API_URL, [{ nome: userState.nome, data: userState.data, local: userState.local, status: 'Aguardando Recebimento' }]);
          responseText = `Encomenda registrada:\nNome: ${userState.nome}\nData Estimada: ${userState.data}\nCompra em: ${userState.local}`;
          delete userStates[sessionId];
        }
        break;

      case 'confirmName':
        const { data: encomendas } = await axios.get(SHEETDB_API_URL);
        const encomenda = encomendas.find(e => e.nome === parameters['nome'] && e.status === 'Aguardando Recebimento');
        if (encomenda) {
          await axios.patch(`${SHEETDB_API_URL}/nome/${encodeURIComponent(parameters['nome'])}`, { status: 'Recebida' });
          responseText = `Recebimento confirmado para ${parameters['nome']}.`;
        } else {
          responseText = `Nenhuma encomenda pendente encontrada para ${parameters['nome']}.`;
        }
        delete userStates[sessionId];
        break;

      default:
        responseText = 'Algo deu errado, tente novamente.';
        delete userStates[sessionId];
    }
  } catch (error) {
    console.error('Erro:', error);
    responseText = 'Ocorreu um erro, tente novamente mais tarde.';
    delete userStates[sessionId];
  }

  res.json({ fulfillmentText: responseText });
});

app.listen(port, () => {
  console.log(`Assistente virtual rodando na porta ${port}`);
});
