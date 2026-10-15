# Diagnóstico de segurança — V1.2.1

## Adendo funcional — V1.2.2

Fotos válidas passam a ser preservadas como bytes em Cache Storage local, além das URLs já presentes nos snapshots. A retenção é limitada a 20 MiB/1.000 imagens, com remoção das mais antigas. A coleta tenta baixá-las também na lista-base, com concorrência e tempo limitados; não garante preservar todas em contas grandes ou redes lentas. A política de hosts/MIME e o limite de 2,5 MB por imagem são mantidos, com timeout de oito segundos. Nenhuma nova permissão ou serviço externo foi adicionado. A análise abaixo descreve a V1.2.1; a persistência das imagens é a alteração de retenção da V1.2.2.

Uma foto já baixada pode ser exibida sem consultar novamente a CDN. Cache sem espaço ou indisponível não invalida a coleta nem bloqueia a exibição de downloads válidos. Fotos antigas com URL expirada e sem bytes locais continuam indisponíveis. A atualização deve recarregar a mesma instalação; desinstalar remove os dados.

## Escopo e método

Foram revisados `manifest.json`, service worker, content script, popup, dashboard, módulos centrais, dependências e todas as ocorrências de rede, cookies e armazenamento. Também foi feita busca por `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval`, `new Function`, `document.cookie`, `chrome.cookies`, `chrome.storage`, `localStorage` e `indexedDB`.

## Achados

### CRÍTICO

Nenhum achado.

### ALTO

Nenhum achado.

### MÉDIO — Dependência de API web privada

- **Problema:** endpoints internos do Instagram não têm contrato público.
- **Arquivo:** `src/content/instagram-scanner.js`.
- **Comportamento:** pagina seguidores e seguindo usando a sessão web autenticada.
- **Risco:** mudanças da Meta, `429` ou challenge podem interromper temporariamente a coleta.
- **Como corrigir:** não existe API oficial equivalente para conta pessoal com o mesmo escopo; manter isolamento, intervalos e tratamento de falha.
- **Status:** mitigado, risco operacional aceito e documentado.

### BAIXO — Dados sociais persistidos localmente

- **Problema:** IDs, usernames, nomes e URLs de fotos do último snapshot ficam no perfil do navegador.
- **Arquivo:** `src/background/service-worker.js`.
- **Comportamento:** usa `chrome.storage.local` para histórico e resultado.
- **Risco:** alguém com acesso ao perfil do sistema/navegador pode ler os dados da extensão.
- **Como corrigir:** limitar retenção e permitir remoção pela desinstalação/limpeza dos dados da extensão; criptografia sem segredo externo não eliminaria esse risco local.
- **Status:** aceito e documentado; não há sincronização externa.

### BAIXO — Carregamento de fotos a partir da Meta

- **Problema:** o worker busca a URL de avatar retornada pelo Instagram.
- **Arquivo:** `src/background/service-worker.js` e `src/core/avatar-policy.js`.
- **Comportamento:** aceita apenas HTTPS em `cdninstagram.com`/`fbcdn.net`, MIME de imagem conhecido e até 2,5 MB; envia `credentials: omit` e sem referrer.
- **Risco:** a CDN recebe a requisição do navegador; URLs antigas podem expirar.
- **Como corrigir:** política já implementada, com conversão local para data URL e fallback.
- **Status:** mitigado.

### INFORMATIVO — Uso transitório da sessão do Instagram

- **Problema:** a consulta precisa da sessão autenticada.
- **Arquivo:** `src/content/instagram-scanner.js`.
- **Comportamento:** lê `csrftoken` de `document.cookie` e claim de `sessionStorage`; cookies de autenticação acompanham `fetch` somente para `www.instagram.com`.
- **Risco:** inerente à funcionalidade, caso o código fosse alterado maliciosamente.
- **Como corrigir:** escopo de host restrito, nenhum domínio terceiro e ausência da permissão `cookies`.
- **Status:** necessário e não persistido.

### INFORMATIVO — Erro assíncrono observado na versão anterior

- **Problema:** `runtime.lastError` indicava canal de mensagem encerrado.
- **Arquivo:** versão anterior/referência visualizada pelo usuário.
- **Risco:** falha funcional, não vazamento.
- **Como corrigir:** handlers atuais sempre retornam resposta tratada; falhas de avatar resultam em fallback.
- **Status:** corrigido na arquitetura atual.

## Permissões

| Permissão | Motivo | Onde é usada | Necessária | Risco | Removível |
|---|---|---|---|---|---|
| `storage` | Snapshot, resultado e progresso | worker, popup e dashboard | Sim | Dados locais acessíveis no perfil | Não |
| `https://www.instagram.com/*` | Content script, API e perfis | manifest, scanner e worker | Sim | Acesso ao conteúdo da página nesse host | Não |
| `https://*.cdninstagram.com/*` | Fotos de perfil | worker | Sim para imagens | Request à CDN da Meta | Apenas se fotos forem removidas |
| `https://*.fbcdn.net/*` | Fotos de perfil | worker | Sim para imagens | Request à CDN da Meta | Apenas se fotos forem removidas |
| `tabs` | Existia para coordenação de abas | versão anterior | Não | Aumentava privilégio declarado | Sim; removida |
| `scripting` | Usada pela referência | somente referência | Não | Injeção dinâmica | Não adicionada |
| `cookies` | Não utilizada | — | Não | Acesso amplo aos cookies | Não adicionada |

## Inventário de comunicação externa

| Domínio | Motivo | Dados enviados | Dados recebidos | Necessário |
|---|---|---|---|---|
| `www.instagram.com` | Login, perfil, seguidores, seguindo e links | Cookies da sessão pelo navegador, CSRF, App ID, claim, ID e cursores | Contagens, IDs, usernames, nomes e URLs de foto | Sim |
| `*.cdninstagram.com` | Avatar | Somente request da URL, sem cookie/referrer da extensão | Bytes da imagem | Sim para foto |
| `*.fbcdn.net` | Avatar | Somente request da URL, sem cookie/referrer da extensão | Bytes da imagem | Sim para foto |

Não existem chamadas para Invertexto, servidor próprio, `graph.instagram.com`, analytics, anúncios ou trackers.

## APIs sensíveis encontradas

- `fetch`: somente Instagram e URLs de avatar validadas.
- `document.cookie`: leitura exclusiva de `csrftoken`, sem persistência.
- `sessionStorage`: leitura de `www-claim-v2`, sem persistência.
- `chrome.storage`: dados locais e estado da execução.

Não encontrados: `XMLHttpRequest` como API (apenas o valor do header `x-requested-with`), `WebSocket`, `navigator.sendBeacon`, `eval`, `new Function`, `chrome.cookies`, `localStorage`, `indexedDB`, scripts externos ou credenciais hardcoded.

## Conclusão objetiva

- **A extensão envia dados para terceiros?** Não. Ela conversa somente com o Instagram e CDNs da própria Meta.
- **Quais dados ficam armazenados?** Último snapshot de seguidores e último resultado: ID, username, nome, URL da foto, URL do perfil, totais e datas.
- **Quais dados saem do navegador?** Requests necessários ao Instagram e à CDN da Meta; nenhum dado é enviado a infraestrutura controlada pelo desenvolvedor.
- **Existe acesso a cookies ou sessão?** Sim, de forma limitada e transitória na página do Instagram. A extensão não solicita `chrome.cookies`, não lê senha e não persiste cookies/tokens.
- **Existe servidor externo?** Não existe backend da extensão.
- **Existem trackers?** Não.
- **Existe comportamento potencialmente malicioso?** Não foi encontrado. Não há execução remota, exfiltração, unfollow automático ou código ofuscado no projeto entregue.
- **As permissões são necessárias?** Sim. `tabs` foi removida; restaram `storage` e os hosts estritamente usados.
- **Eu consideraria seguro utilizar na conta pessoal?** Sim, com ressalva técnica: o código auditado não envia dados a terceiros e aplica menor privilégio, mas depende de endpoints privados do Instagram. Isso traz risco de bloqueio temporário, challenge ou quebra funcional futura — não evidência de roubo de credenciais. Recomenda-se usar com moderação e revisar novas versões antes de instalá-las.
