# Critérios de aceite — V1

## Cenário 1 — Primeira execução

- Dado que não existe snapshot para a conta;
- quando uma varredura completa terminar;
- então a lista será salva como linha de base;
- e nenhuma pessoa será marcada como unfollow.

## Cenário 2 — Pessoa ausente

- Dado que `@ana` existe no snapshot anterior;
- e não existe na coleta completa atual;
- quando a comparação terminar;
- então `@ana` será exibida no resultado com os dados preservados do snapshot anterior.

## Cenário 3 — Novo seguidor

- Dado que `@bruno` não existia antes;
- e aparece na coleta atual;
- quando a comparação terminar;
- então `@bruno` entrará no novo snapshot, mas não será mostrado na interface.

## Cenário 4 — Coleta incompleta

- Dado que o Instagram informa uma contagem exata;
- e a extensão coleta uma quantidade diferente;
- quando o scroll estabilizar;
- então a varredura falhará;
- e o último snapshot válido não será alterado.

## Cenário 5 — Persistência

- Dado que existe um snapshot salvo;
- quando Edge/Chrome ou o computador for reiniciado;
- então o snapshot continuará disponível no mesmo perfil do navegador.

## Cenário 6 — Privacidade

- Durante todo o fluxo, nenhuma senha ou lista de seguidores será enviada para servidor externo.
