# Requisitos — V1.2.1

## Objetivo

Exibir, sem backend, quem deixou de seguir a conta autenticada e quem ela segue atualmente sem receber follow de volta.

## Regras de negócio

- `DEIXARAM_DE_SEGUIR = SNAPSHOT_ANTERIOR_SEGUIDORES - SEGUIDORES_ATUAIS`.
- `NAO_ME_SEGUEM = SEGUINDO_ATUAL - SEGUIDORES_ATUAIS`.
- As regras são independentes.
- A identidade primária é o ID numérico do Instagram; username normalizado é fallback legado.

## Requisitos funcionais

- RF01 — Exibir fotos de perfil quando disponíveis.
- RF02 — Usar avatar padrão em qualquer falha de imagem.
- RF03 — Usar o ícone fornecido em 16, 32, 48 e 128 pixels.
- RF04 — Preservar **Quem deixou de me seguir**.
- RF05 — Exibir **Não me seguem**.
- RF06 — Paginar todos os seguidores.
- RF07 — Paginar todas as contas seguidas.
- RF08 — Comparar em O(n), sem duplicatas.
- RF09 — Exibir o total de cada resultado.
- RF10 — Exibir username, nome disponível e link do perfil.
- RF11 — Preservar o snapshot necessário ao histórico.
- RF12 — Mostrar progresso, cancelamento e erros compreensíveis.
- RF13 — Não substituir o snapshot quando a coleta for incompleta.
- RF14 — Manter o histórico pelo fallback visual quando a API interna falhar.

## Requisitos não funcionais

- RNF01 — Nenhum dado enviado a infraestrutura de terceiros.
- RNF02 — Manifest V3 com menor privilégio.
- RNF03 — Responsabilidades separadas por módulo.
- RNF04 — Evitar chamadas duplicadas e espaçar a paginação.
- RNF05 — Suportar milhares de usuários com `Map` e `Set`.
- RNF06 — Não bloquear a interface.
- RNF07 — Não expor stack traces na interface.
- RNF08 — Sem dependências de produção ou scripts remotos.
- RNF09 — Sem `innerHTML` para dados de usuário.

## Permissões mínimas

- `storage`: snapshot, resultado e sessão de execução.
- `https://www.instagram.com/*`: content script e consultas autenticadas.
- `https://*.cdninstagram.com/*` e `https://*.fbcdn.net/*`: imagens de perfil validadas.

## Fora do escopo

- Deixar de seguir automaticamente.
- Login adicional, senha ou exportação de cookies.
- Backend, banco remoto, analytics ou telemetria.
- Histórico de várias datas.
- Publicação nas lojas.
