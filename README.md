# Unfollow Local para Instagram

Extensão local para Microsoft Edge e Google Chrome que mantém duas análises separadas:

- **Quem parou de me seguir:** compara o snapshot atual de seguidores com o anterior.
- **Não me seguem:** calcula, no estado atual, `seguindo - seguidores`.

**Categoria:** Extensão de navegador · Comparação de seguidores.

## Tecnologias principais

- JavaScript
- Chrome Extension Manifest V3
- APIs de armazenamento do navegador

A comparação é feita por diferenças entre conjuntos e snapshots. Este projeto não utiliza modelos de IA ou aprendizado de máquina. O dashboard, o popup e a coleta fazem parte desta mesma extensão, sem backend separado.

## Versão

`1.4.0` — histórico acumulado de quem parou de seguir (apagar um/todos), selo "Novo" em quem não me segue, botão "Verificar os dois" e foto/@ clicáveis.

`1.3.0` — nova seção na aba de quem parou de seguir para contas que desapareceram das listas de seguidores e seguindo entre duas verificações completas.

## Como instalar

1. Extraia o ZIP.
2. Abra `edge://extensions` ou `chrome://extensions`.
3. Ative **Modo de desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta extraída que contém o `manifest.json`.
6. Fixe a extensão na barra do navegador.

Ao atualizar uma instalação carregada sem compactação, substitua os arquivos na mesma pasta e clique em **Recarregar** no cartão da extensão. Mantenha o mesmo ID e não desinstale: a remoção apaga os dados locais e o histórico. Feche dashboards antigos e abra o resultado novamente pelo popup.

## Como usar

1. Clique no ícone da extensão.
2. Escolha **Quem parou de me seguir** ou **Quem não me segue de volta**.
3. Faça login diretamente no Instagram, se necessário.
4. Mantenha a aba aberta durante a paginação.
5. O dashboard abrirá diretamente na análise escolhida.

Na primeira execução, a extensão cria a linha de base de seguidores. A análise **Não me seguem** já fica disponível na primeira coleta completa.

## Relação encerrada nos dois sentidos

Na aba **Quem parou de me seguir**, uma seção separada mostra contas que estavam nas listas anteriores de seguidores e seguindo e desapareceram de ambas. A lista principal continua mostrando todos que deixaram de seguir.

Essa comparação exige duas verificações consecutivas dessa aba com ambas as listas completas. Snapshots antigos e coletas pelo modo visual não incluem seguindo: nesse caso, a seção mostra **Indisponível**, sem inferir um resultado vazio. A coleta pela API passa a consultar também seguindo e pode demorar mais. A aba **Não me seguem** não atualiza essa linha de base.

O resultado não comprova que alguém removeu você dos seguidores: unfollow manual, bloqueio e indisponibilidade de conta podem produzir mudanças semelhantes. A extensão identifica mudanças nas listas, sem atribuir causa ou iniciativa.

## Fotos de perfil

A URL de `profile_pic_url` retornada pelo Instagram é validada e carregada somente de CDNs da Meta (`cdninstagram.com` e `fbcdn.net`). Os bytes da imagem são preservados no Cache Storage da extensão, separados dos snapshots. Ao reabrir o dashboard, o worker procura primeiro a cópia local e a converte para uma URL de dados, inclusive quando o endereço original expirou ou a rede está indisponível.

A coleta tenta preservar fotos dos resultados e da lista-base de seguidores antes de concluir. São até quatro downloads simultâneos, até 1.000 URLs por coleta e uma janela de 20 segundos para iniciar downloads (cada pedido tem timeout de 8 segundos). O cache guarda até 1.000 fotos ou 20 MiB de imagens; ao atingir um limite, remove as cópias mais antigas. Assim, contas grandes ou redes lentas podem ter fotos não preservadas. Fotos carregadas pelo dashboard também entram no cache.

Na versão anterior, somente as URLs eram persistidas; a conversão da foto para data URL acontecia em memória. Fotos antigas sem cópia local e com URL expirada não podem ser recuperadas desse histórico. Uma nova coleta traz URLs atuais para as contas que ainda aparecem nas listas. Falhas de download/armazenamento não apagam o snapshot, e imagens indisponíveis continuam usando a inicial do perfil. A cópia local não é um backup: pode ser removida pelos limites do cache, por pressão de armazenamento do navegador ou pela desinstalação.

## Privacidade

- Sem backend, analytics, publicidade ou telemetria.
- A senha nunca é lida ou armazenada.
- O cookie CSRF e o claim da sessão são lidos apenas durante a consulta e não são persistidos.
- Cookies de autenticação acompanham somente requisições feitas ao próprio Instagram.
- Snapshots e o último resultado ficam em `chrome.storage.local`.
- Cópias das fotos ficam no Cache Storage local da extensão, com retenção limitada.
- Estado de execução fica em `chrome.storage.session`.

## Proteção contra falso positivo

Uma coleta incompleta não substitui o último snapshot válido. A comparação usa o ID numérico do Instagram quando disponível e o username normalizado apenas como compatibilidade com snapshots antigos.

## Testes

```bash
npm test
npm run check
```

## Limitações

- Os endpoints usados pela própria página do Instagram não possuem contrato público e podem mudar sem aviso.
- O Instagram pode impor limitação temporária ou solicitar verificação de segurança.
- O fallback visual coleta somente seguidores; nele, o histórico permanece protegido, mas **Não me seguem** fica indisponível.
- Use com moderação e somente na sua própria conta.

O SDD está em `docs/sdd/` e a auditoria completa em `docs/security-audit.md`.

## Capturas da aplicação

As duas capturas do dashboard foram fornecidas pelo usuário em 13/10/2026 e mostram as análises **Quem parou de me seguir** e **Não me seguem**. Nomes, @usuários, identificador da conta no cabeçalho e iniciais dos avatares foram borrados nas versões publicadas.

As imagens são versões editadas para ocultar identificadores. As contagens e a data de verificação exibidas pertencem ao estado fotografado; não representam uma consulta atual nem dados de demonstração. A coleta e a exatidão dos resultados não foram verificadas independentemente pelo agente.

O dashboard foi identificado como uma página da extensão instalada no Edge. O controle automatizado não conseguiu acessar seu endereço `chrome-extension://`, pois a ferramenta aceita apenas HTTP e HTTPS. As capturas foram enviadas pelo usuário, sem substituir a extensão por um popup HTTP ou uma interface simulada.

### Quem parou de me seguir

![Dashboard de quem parou de seguir, com identificadores borrados](docs/screenshots/quem-parou-de-seguir.png)

### Não me seguem

Esta análise mostra as contas seguidas que não aparecem na lista atual de seguidores. Ela não comprova que uma pessoa nunca seguiu a conta.

![Dashboard de contas que não seguem de volta, com identificadores borrados](docs/screenshots/nao-me-seguem.png)

## Histórico

Repositório criado no GitHub em **2026-09-21**. Essa data identifica a criação do repositório; não comprova o início nem a conclusão do desenvolvimento.

## Novidades

- Histórico acumulado de quem parou de seguir, com opção de apagar um ou todos.
- Selo "Novo" e contador em "Não me seguem".
- Botão "Verificar os dois" (popup e dashboard): uma coleta atualiza as duas análises.
- Foto e @ clicáveis abrem o perfil no Instagram.
