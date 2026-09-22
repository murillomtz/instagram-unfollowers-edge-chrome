# Tarefas — V1.2.1

- [x] Analisar a extensão atual e preservar o snapshot histórico.
- [x] Extrair e analisar a referência sem copiar sua implementação.
- [x] Comparar manifestos, endpoints, paginação, armazenamento e fotos.
- [x] Coletar ID, username, nome e `profile_pic_url`.
- [x] Paginar seguidores e contas seguidas com proteção de cursor.
- [x] Implementar `seguindo - seguidores` em O(n).
- [x] Manter a regra histórica separada da regra atual.
- [x] Comparar por ID estável com fallback legado.
- [x] Implementar avatar com allowlist, limite e fallback.
- [x] Criar abas, totais, estados e links de perfil.
- [x] Gerar ícones 16, 32, 48 e 128 sem distorção.
- [x] Remover a permissão `tabs` e revisar hosts.
- [x] Tratar login, expiração, rate limit, timeout e resposta inesperada.
- [x] Adicionar testes do comparador, avatar e manifesto.
- [x] Executar auditoria estática de rede, armazenamento e código dinâmico.
- [x] Separar os dois modos em ações independentes.
- [x] Exibir progresso individual por lista, sem somar followers e following.
- [x] Impedir fallback visual no modo “Não me seguem”.
- [x] Aceitar pequena divergência final em following após paginação completa.
- [ ] Validar a coleta com uma sessão real do usuário no Edge.

A última tarefa depende da conta autenticada do usuário. Os testes locais não simulam as respostas privadas reais do Instagram.
