# Rumo ao Equilíbrio

## Iniciar o site

Requer Node.js 22.13 ou posterior. Na pasta do projeto, execute:

```sh
npm start
```

Abra <http://127.0.0.1:3000>. A página de pesquisa precisa ser aberta pelo servidor para conseguir gravar respostas; abrir o arquivo HTML diretamente não conecta ao banco.

## Códigos individuais da pesquisa

Na primeira visita à pesquisa, o servidor cria automaticamente um código aleatório para o navegador e a página o mostra para a pessoa guardar. O código fica salvo no navegador e é usado ao enviar a pesquisa; não é necessário digitá-lo. O banco guarda apenas os hashes do código e do identificador do navegador. Um navegador só pode registrar um código; cada código só pode enviar uma pesquisa. O banco impõe as regras mesmo se duas tentativas forem feitas ao mesmo tempo.

O nome digitado não é enviado ao servidor nem guardado junto às respostas. As respostas ficam no SQLite em `data/surveys.sqlite`, fora da pasta pública do site. A identificação automática vale por navegador: limpar os dados ou usar outro dispositivo cria uma identidade diferente. Para garantir uma pesquisa por pessoa entre dispositivos, será necessário adicionar cadastro com identidade verificada. Os dados ficam no servidor que executa a aplicação; para uso remoto, mantenha o banco em volume persistente e use HTTPS. O projeto não envia nem compartilha as respostas com serviços externos.

Se precisar armazenar o banco em outro volume, defina `DB_PATH` antes de iniciar o servidor. A porta e o endereço de escuta podem ser configurados com `PORT` e `HOST`.

## Testes

```sh
npm test
```
