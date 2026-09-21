# Unfollow Local para Instagram

Extensão local para Microsoft Edge e Google Chrome que compara snapshots dos seus seguidores e mostra quem deixou de seguir.

## Versão

`1.1.0` — coleta paginada pela mesma conexão interna usada pelo Instagram, com o modo visual como fallback.

## Como instalar no Edge

1. Extraia o arquivo ZIP.
2. Abra `edge://extensions`.
3. Ative **Modo de desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta extraída que contém o `manifest.json`.
6. Fixe a extensão na barra do navegador.

No Chrome, use `chrome://extensions` e os mesmos passos.

## Como usar

1. Clique no ícone da extensão.
2. Clique em **Verificar agora**.
3. Faça login no Instagram, se necessário.
4. Mantenha a aba aberta enquanto a lista é consultada e paginada.
5. Na primeira execução, a extensão cria a linha de base.
6. A partir da segunda execução, o dashboard mostra as contas ausentes.

## Privacidade

- Sem backend e sem telemetria.
- A senha nunca é lida pela extensão.
- Cookies e tokens de sessão não são armazenados pela extensão.
- Snapshot e resultado ficam em `chrome.storage.local` no perfil do navegador.
- Limpar apenas o cache comum não remove o snapshot; desinstalar a extensão ou apagar seus dados remove.

## Proteção contra falso positivo

Uma varredura considerada incompleta falha e não substitui o último snapshot válido. Isso evita que uma interrupção no carregamento seja interpretada como vários unfollows.

## Testes

```bash
npm test
npm run check
```

## Observações

- A conexão usada pela página do Instagram não possui contrato público e pode mudar sem aviso; se ela estiver indisponível, a extensão tenta o modo visual.
- Use com moderação e apenas na sua própria conta.
- A coleta de listas muito grandes pode sofrer lentidão ou limitação pela plataforma.
- A V1 mantém somente o último snapshot e o último resultado.

O SDD completo está em `docs/sdd/`.
