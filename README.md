// Arquivo README.md
const fs = require('fs');
const readmeContent = `# Assistente Virtual Pousada JK

Este é um assistente virtual desenvolvido em Node.js para gerenciar encomendas e problemas na pousada JK, integrado com o Dialogflow.

## Configuração:
1. Clone o repositório:
   \`\`\`
git clone https://github.com/seu-usuario/assistente-virtual.git
cd assistente-virtual
   \`\`\`
2. Instale as dependências:
   \`\`\`
npm install
   \`\`\`
3. Configure a API do SheetDB:
   - Crie uma conta no [SheetDB](https://sheetdb.io/).
   - Crie uma planilha com colunas: nome, data, local, status.
   - Substitua \`YOUR_SHEETDB_ID\` no código com seu ID do SheetDB.

4. Rode o servidor:
   \`\`\`
npm start
   \`\`\`

## Deploy no Render:
1. Crie um novo serviço no Render.
2. Conecte o repositório do GitHub.
3. Configure a porta como \`3000\` ou use \`process.env.PORT\`.
4. O Render vai fornecer um link que você deve adicionar ao Dialogflow como webhook.

Pronto! 🚀`;

fs.writeFileSync('README.md', readmeContent);
