# Critérios de aceite — V1.2.1

## Histórico de unfollow

- A primeira coleta completa cria a linha de base sem falso unfollow.
- Uma conta presente antes e ausente agora aparece em **Quem deixou de me seguir**.
- Uma coleta incompleta não altera o snapshot anterior.
- Mudança de username não cria falso unfollow quando o ID está disponível.

## Não me seguem

- Com 100 seguidores, 120 seguindo e diferença de 20, o total exibido é 20.
- Alguém que nunca seguiu a conta pode aparecer somente em **Não me seguem**.
- Alguém que deixou de seguir e ainda é seguido pode aparecer nas duas áreas.
- O cálculo usa estado atual e não depende do histórico.
- Não existem duplicatas.

## Fotos e perfis

- Foto válida de CDN da Meta é exibida.
- Foto ausente, expirada, de host não permitido ou com erro usa fallback.
- A listagem permanece funcional quando uma imagem falha.
- O link abre o perfil correspondente.

## UX e robustez

- As áreas têm títulos, totais, estados vazios e carregamento claros.
- Erros técnicos são convertidos em mensagens compreensíveis.
- A interface não bloqueia durante paginação ou imagens.
- A extensão inicia em Edge e Chrome com Manifest V3.

## Segurança

- Sem backend, analytics, trackers, bibliotecas remotas ou credenciais fixas.
- Somente Instagram e CDNs da Meta aparecem no manifesto.
- Sem permissões `cookies` ou `tabs`.
- Dados sociais não são transmitidos a domínio externo à Meta.
