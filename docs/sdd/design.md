# Design técnico — V1

## Componentes

1. `popup`: inicia/cancela o scan e mostra o último resumo.
2. `service-worker`: coordena abas, sessão, comparação e persistência.
3. `content-script`: consulta a lista paginada usada pela própria página e mantém a coleta visual como fallback.
4. `core`: comparação pura, independente do navegador.
5. `dashboard`: mostra a linha de base ou as contas ausentes.

## Fluxo principal

1. O popup envia `START_SCAN`.
2. O service worker cria uma sessão temporária e abre/reutiliza o Instagram.
3. O content script identifica login e conta.
4. O content script identifica o ID da conta autenticada no estado já entregue pelo Instagram.
5. A lista é consultada em páginas de 50 registros e acumulada em um `Map` até o fim de `next_max_id`.
6. Se a consulta interna estiver indisponível, abre o modal e executa a coleta visual com scroll.
7. O content script envia `SCAN_COMPLETE` apenas após validar o fim e a contagem.
8. O service worker compara o snapshot atual com o anterior.
9. O snapshot atual substitui o anterior e o dashboard é aberto.

## Modelo persistido

```json
{
  "followersSnapshot:conta": {
    "account": "conta",
    "scannedAt": "ISO-8601",
    "total": 2,
    "followers": {
      "usuario": {
        "username": "usuario",
        "name": "Nome",
        "avatarUrl": "https://...",
        "profileUrl": "https://www.instagram.com/usuario/"
      }
    }
  }
}
```

## Integridade da coleta

- Contagem exata retornada pelo perfil: o número coletado deve ser idêntico.
- Contagem abreviada: o fim do scroll deve permanecer estável e o total deve ficar dentro de uma tolerância de 6%.
- Sem contagem disponível: exige fim estável e pelo menos um usuário.
- Timeout: 30 minutos.
- Em qualquer falha, o snapshot anterior permanece intacto.

## Segurança e privacidade

- Os dados permanecem em `chrome.storage.local`.
- Estado transitório fica em `chrome.storage.session`.
- A extensão reutiliza somente a sessão já autenticada na aba; cabeçalhos de sessão são transitórios e não são persistidos.
- Nenhum dado é enviado para backend.
- Links externos usam URL construída a partir de username validado.

## Limitações conhecidas

O endpoint utilizado pela própria página do Instagram não possui contrato público e pode mudar ou aplicar limitação. O fallback visual também depende de uma estrutura de DOM não estável. URLs de avatar podem expirar e, nesse caso, o dashboard mantém nome, username e link do perfil, mas a imagem pode deixar de carregar.
