# Análise da extensão de referência

## Estrutura e execução

A referência usa Manifest V3, um service worker e injeção programática de content script sobre `instagram.com`. A interface é adicionada à própria página do Instagram. Ela possui a permissão `scripting` e host amplo `https://*.instagram.com/*`.

## Identificação e coleta

- Descobre o ID da conta autenticada em dados já presentes na página (`viewerId`/`appScopedIdentity`).
- Lê token CSRF, App ID e claim da sessão para reproduzir requests da interface web.
- Consulta `/api/v1/users/{id}/info/` para contagens.
- Pagina seguidores em `/api/v1/friendships/{id}/followers/`.
- Pagina contas seguidas em `/api/v1/friendships/{id}/following/`.
- Usa `next_max_id` e lotes de 50.
- Encerra quando não há novo cursor; não exige igualdade absoluta entre o contador do perfil e a quantidade retornada.
- Identifica usuários por `pk`/`pk_id` e também guarda username/nome.
- Obtém a foto diretamente de `profile_pic_url`.
- Calcula `following - followers` por ID numérico.

## Armazenamento e rede

A lógica analisada usa a sessão autenticada do Instagram. Não foi identificado envio da lista social a backend próprio. Existem links de navegação para Invertexto e loja, mas não foram encontrados requests de coleta para esses domínios.

## O que foi reaproveitado como conceito

- Endpoints, campos de usuário, cursor de paginação e comparação por ID.
- Coleta das contagens para detectar paginação incompleta.
- Uso da URL de foto retornada pela resposta do Instagram.

## O que não foi copiado

- Estrutura, interface e código da referência.
- Ação automática de deixar de seguir encontrada na referência.
- Permissão `scripting`, desnecessária porque nossa extensão declara um content script estático.
- Injeção da interface dentro do Instagram.

## Melhorias adotadas

- Atraso entre páginas e timeout explícito.
- Proteção contra cursor repetido e contra sobrescrever snapshot incompleto.
- Validação rígida de seguidores para o histórico e tolerância pequena somente para a lista de contas seguidas.
- Allowlist de CDN, MIME e limite de tamanho para fotos.
- Dashboard isolado, renderização por DOM seguro e avatar fallback.
- Separação explícita entre histórico de unfollow e diferença atual.
