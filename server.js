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
  const escolha = req.body.queryResult.queryText !== undefined ? parseInt(req.body.queryResult.queryText, 10) : (parametros.numero || parametros.opcao);
  let respostaTexto = '';

  if (!estadosUsuarios[idSessao]) {
    estadosUsuarios[idSessao] = { etapa: 'menu' };
  }

  const estadoUsuario = estadosUsuarios[idSessao];

  try {
    switch (estadoUsuario.etapa) {
      case 'menu':
      case 'aguardandoEscolha':
        if (escolha === 0) {
          respostaTexto = 'Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento\n4. Registrar Conta de Luz';
          estadoUsuario.etapa = 'aguardandoEscolha';
        } else if (escolha === 1) {
          estadoUsuario.etapa = 'obterNome';
          respostaTexto = 'Qual o seu nome?';
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          if (data.length) {
            respostaTexto = data.map(e => {
              let texto = `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}`;
              if (e.status === 'Recebida' && e.recebedor) {
                texto += `\nRecebida por: ${e.recebedor}`;
              }
              return texto;
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
        estadoUsuario.encomendaPara = req.body.queryResult.queryText;
        estadoUsuario.etapa = 'confirmarRecebedor';
        respostaTexto = 'Qual o seu nome? (Quem está recebendo a encomenda?)';
        break;

      case 'confirmarRecebedor':
        estadoUsuario.recebedor = req.body.queryResult.queryText;

        const { data: lista } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomendaIndex = lista.findIndex(e => e.nome === estadoUsuario.encomendaPara && e.status === 'Aguardando Recebimento');

        if (encomendaIndex !== -1) {
          await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/nome/${encodeURIComponent(estadoUsuario.encomendaPara)}`, {
            status: 'Recebida',
            recebedor: estadoUsuario.recebedor
          });
          respostaTexto = `Recebimento confirmado! A encomenda de ${estadoUsuario.encomendaPara} foi recebida por ${estadoUsuario.recebedor}.`;
        } else {
          respostaTexto = `Não encontrei nenhuma encomenda pendente para ${estadoUsuario.encomendaPara}.`;
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
    
