# Design técnico — V1.2.2

## Componentes

1. `popup`: inicia/cancela e mostra o resumo.
2. `service-worker`: coordena abas, comparação, persistência e avatares.
3. `content-script`: identifica a conta e pagina seguidores/seguindo.
4. `core/follower-comparator`: normaliza identidades e executa as diferenças.
5. `core/avatar-policy`: restringe host, protocolo, MIME e tamanho.
6. `dashboard`: apresenta as duas análises e abre perfis.
7. `core/avatar-store`: persiste bytes das fotos em Cache Storage, com gravações serializadas e limites de 20 MiB/1.000 entradas.

## Fluxo principal

1. O popup envia `START_SCAN`.
2. O service worker abre ou reutiliza o Instagram.
3. O content script identifica login, username e ID numérico.
4. Consulta `/api/v1/users/{id}/info/` para as contagens.
5. Em **Quem parou de me seguir**, pagina somente `/followers/`.
6. Em **Quem não me segue de volta**, pagina `/followers/` e depois `/following/`, reiniciando o progresso entre as listas.
7. Mapeia `pk`/`pk_id`, `username`, `full_name` e `profile_pic_url`.
8. Valida as contagens antes de `SCAN_COMPLETE`.
9. O worker calcula somente a análise solicitada e abre a aba correspondente no dashboard.
10. Após salvar os dados, o worker tenta preservar fotos dos resultados e da lista-base: até 1.000 URLs, concorrência de quatro, janela de 20 segundos e timeout de oito segundos por download. Falhas de foto não invalidam a coleta.
11. O dashboard solicita fotos ao worker; ele valida a CDN, consulta os bytes locais antes da rede e devolve uma URL de dados. Downloads válidos também alimentam o cache. Qualquer falha mantém o avatar padrão.

## Fallback

Somente no modo **Quem parou de me seguir**, se a consulta interna falhar, o content script pode percorrer visualmente a lista de seguidores. O modo **Quem não me segue de volta** nunca abre esse fallback, pois ele precisa das duas listas completas.

## Modelo persistido

```json
{
  "followersSnapshot:conta": {
    "account": "conta",
    "scannedAt": "ISO-8601",
    "total": 2,
    "followers": {
      "usuario": {
        "id": "123456",
        "username": "usuario",
        "name": "Nome",
        "avatarUrl": "https://cdn-da-meta/...",
        "profileUrl": "https://www.instagram.com/usuario/"
      }
    }
  },
  "lastScanResult": {
    "removed": [],
    "nonFollowers": [],
    "nonFollowersAvailable": true
  }
}
```

## Integridade e performance

- Coleções em `Map`; índices de IDs em `Set`.
- Deduplicação por ID estável, com username como fallback.
- Cursor repetido interrompe a coleta.
- Timeout de request: 20 segundos; varredura: 30 minutos.
- Atraso aleatório de 1,5 a 3 segundos entre páginas.
- Seguidores exigem contagem exata para proteger o histórico.
- Contas seguidas aceitam diferença final de até 1%, no mínimo duas contas, somente após o fim normal da paginação.
- Coleta incompleta nunca substitui o snapshot válido.

## Tratamento de erros

- Login ausente/expirado e challenge: mensagem orientativa.
- `401`/`403`: sessão recusada; `429`: limitação temporária.
- JSON inválido, paginação repetida, timeout e contagem divergente: falha segura.
- Avatar inválido, maior que 2,5 MB ou expirado sem cópia local: fallback local.
- Cache indisponível/sem quota: exibe a imagem obtida da rede sem comprometer o snapshot.

## Segurança e privacidade

- Sem código remoto ou dependência de produção.
- Cookies de sessão seguem somente ao Instagram com `credentials: include`.
- CSRF e claim são transitórios e não persistidos.
- Imagens somente por HTTPS das CDNs da Meta e MIME permitido.
- Snapshots em `chrome.storage.local`; imagens binárias em Cache Storage; estado em `chrome.storage.session`.
- Sem backend, analytics, tracker, WebSocket ou beacon.

## Limitação arquitetural

A API web do Instagram é privada e pode mudar. Isso pode exigir manutenção futura, embora não envie dados a terceiros.

O cache tem retenção limitada: remove imagens antigas ao atingir o orçamento e pode sofrer eviction pelo navegador. URLs antigas que expiraram antes de serem baixadas não são recuperáveis pelo snapshot. O formato JSON existente é mantido, sem migração destrutiva. A atualização deve recarregar a mesma instalação, preservando seu ID.
