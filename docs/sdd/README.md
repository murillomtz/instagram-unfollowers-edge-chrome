# SDD — Unfollow Local V1.2.1

Especificação da versão com histórico de unfollow, análise atual de não seguidores e avatares seguros.

## Documentos

- `requirements.md`: escopo, regras e requisitos.
- `design.md`: arquitetura, fluxos, dados e tratamento de erros.
- `tasks.md`: checklist de implementação.
- `acceptance.md`: critérios de aceite testáveis.
- `../security-audit.md`: diagnóstico de segurança e permissões.

## Regra central

Uma coleta incompleta nunca substitui o último snapshot válido. **Quem deixou de me seguir** depende de histórico; **Não me seguem** depende somente das coleções atuais.
