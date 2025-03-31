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
  const parametros = req.body.queryResult.parameters;
  const escolha = parseInt(req.body.queryResult.queryText) || parametros.numero || parametros.opcao;
  let respostaTexto = '';

  if (!estadosUsuarios[idSessao]) {
    estadosUsuarios[idSessao] = { etapa: 'menu' };
  }

  const estadoUsuario = estadosUsuarios[idSessao];

  try {
    switch (estadoUsuario.etapa) {
      case 'menu':
        respostaTexto = 'Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento\n4. Registrar Conta de Luz';
        estadoUsuario.etapa = 'aguardandoEscolha';
        break;

      case 'aguardandoEscolha':
        if(escolha === 0) {
          menu.etapa = 'Menu' ;
        } if (escolha === 0)
        else if (escolha === 1) {
          estadoUsuario.etapa = 'obterNome';
          respostaTexto = 'Qual o seu nome?';
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          respostaTexto = data.length ? data.map(e => `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}`).join('\n\n') : 'Nenhuma encomenda encontrada.';
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estadoUsuario.etapa = 'confirmarNome';
          respostaTexto = 'Qual o seu nome para confirmar o recebimento?';
        } else if (escolha === 4) {
          estadoUsuario.etapa = 'obterNomeLuz';
          respostaTexto = 'Qual o seu nome para registrar a conta de luz?';
        } else {
          respostaTexto = 'Opção inválida. Escolha entre 1, 2, 3 ou 4.';
        }
        break;

      // Registrar Encomenda
      case 'obterNome':
        estadoUsuario.nome = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'obterData';
        respostaTexto = 'Qual a data estimada de entrega? (Ex: 18/03/2025)';
        break;

      case 'obterData':
        estadoUsuario.data = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'obterLocal';
        respostaTexto = 'Onde a compra foi realizada? (Ex: Amazon, Mercado Livre, Farmácia Delivery)';
        break;

      case 'obterLocal':
        estadoUsuario.local = req.body.queryResult.queryText;
        console.log("Enviando para SheetDB:", {
  nome: estadoUsuario.nome,
  data: estadoUsuario.data,
  local: estadoUsuario.local,
  status: 'Aguardando Recebimento'
});
        await axios.post(URL_SHEETDB_ENCOMENDAS, [{ nome: estadoUsuario.nome, data: estadoUsuario.data, local: estadoUsuario.local, status: 'Aguardando Recebimento' }]);
        respostaTexto = `Ok, ${estadoUsuario.nome}! Sua encomenda chegará no dia ${estadoUsuario.data} e foi comprada em ${estadoUsuario.local}.`;
        delete estadosUsuarios[idSessao];
        break;

      // Confirmar Recebimento
      case 'confirmarNome':
        const { data: encomendas } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = encomendas.find(e => e.nome === req.body.queryResult.queryText && e.status === 'Aguardando Recebimento');
        if (encomenda) {
          await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/nome/${encodeURIComponent(req.body.queryResult.queryText)}`, { status: 'Recebida' });
          respostaTexto = `Recebimento confirmado para ${req.body.queryResult.queryText}.`;
        } else {
          respostaTexto = `Nenhuma encomenda pendente encontrada para ${req.body.queryResult.queryText}.`;
        }
        delete estadosUsuarios[idSessao];
        break;

      // Registrar Conta de Luz
      case 'obterNomeLuz':
        estadoUsuario.nome = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'obterValorLuz';
        respostaTexto = 'Qual o valor da conta de luz?';
        break;

      case 'obterValorLuz':
        await axios.post(URL_SHEETDB_LUZ, [{ nome: estadoUsuario.nome, valor: req.body.queryResult.queryText }]);
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
