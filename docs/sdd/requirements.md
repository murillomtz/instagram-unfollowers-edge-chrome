# Requisitos — V1

## Objetivo

Permitir que o usuário compare duas listas completas de seguidores do próprio perfil do Instagram e veja somente as contas que estavam no snapshot anterior e não aparecem no snapshot atual.

## Escopo definido

- Prioridade 1: Microsoft Edge.
- Prioridade 2: Google Chrome.
- Distribuição: uso pessoal, carregamento local sem loja.
- Interface inicial: popup da extensão.
- Resultado: somente quem deixou de seguir.
- Persistência: último snapshot válido e último resultado.
- Backend: inexistente.
- Coleta: paginação da conexão interna usada pela página, com DOM e scroll automático como fallback.
- Login: realizado diretamente no Instagram; a extensão não lê nem armazena senha.

## Requisitos funcionais

- RF01 — Exibir popup ao clicar no ícone.
- RF02 — Iniciar a verificação pelo botão `Verificar agora`.
- RF03 — Abrir ou reutilizar uma aba do Instagram.
- RF04 — Aguardar o login quando necessário.
- RF05 — Identificar o perfil autenticado e consultar sua lista de seguidores.
- RF06 — Coletar `username`, nome, URL do avatar e URL do perfil.
- RF07 — Deduplicar seguidores usando o `username` normalizado como chave.
- RF08 — Salvar a primeira coleta apenas como linha de base.
- RF09 — Nas coletas seguintes, calcular ausências do snapshot anterior em O(n).
- RF10 — Mostrar nome, `@`, foto e link do perfil para cada ausência.
- RF11 — Salvar dados no armazenamento local da extensão.
- RF12 — Exibir progresso e permitir cancelamento.
- RF13 — Não atualizar o snapshot quando a coleta for considerada incompleta.

## Requisitos não funcionais

- RNF01 — Manifest V3 e APIs Chromium compatíveis com Edge e Chrome.
- RNF02 — Nenhum servidor, telemetria ou dependência externa.
- RNF03 — Permissões mínimas: `storage`, `tabs` e host do Instagram.
- RNF04 — Não usar coordenadas de tela ou Selenium; não contornar login nem consultar outra conta.
- RNF05 — Separar coleta, comparação, persistência e apresentação.
- RNF06 — Tratar alterações do DOM com mensagens de erro compreensíveis.
- RNF07 — Não inserir HTML de dados coletados por `innerHTML` no dashboard.

## Fora do escopo da V1

- Histórico de várias verificações.
- Exibição de novos seguidores.
- Backup/importação.
- Suporte a múltiplas redes sociais.
- Publicação nas lojas.
- Integração OAuth com a API oficial do Instagram.
- Contas com quantidades extremamente grandes, cuja coleta visual pode sofrer limites da plataforma.
