# Plano do piloto de campo — especificação

Documento de decisões para o piloto (área de ~600 ha, 2 a 3 equipes). **Nada aqui está implementado.** Base: versão 1.1.0 (ver `LOG-PROJETO.md`). Sem cronograma, por decisão do responsável.

## 1. Premissas

- Os dados em campo **nunca podem ser perdidos**: o IndexedDB local continua sendo a fonte primária; qualquer troca de dados é aditiva e idempotente.
- Sem servidor nesta fase. O **coordenador** centraliza; as equipes só coletam. Os pacotes trafegam por arquivo, enviados por **WhatsApp**.
- As equipes não podem ficar com acesso ao app depois da campanha.
- A coleta precisa ter o mínimo de informação na tela (teclado ocupa espaço, risco de erro de digitação). Uso do aparelho **na vertical**.
- A prioridade é proteger a **aplicação** (acesso e cópia), mais do que os dados.

## 2. Perfis

| | Coordenador | Coletor |
|---|---|---|
| Criar projeto, talhões e parcelas planejadas | Sim | Não |
| Opções do projeto (usar linha, usar qualidade) | Sim | Não |
| Atribuir talhões/parcelas às equipes | Sim | Não |
| Ver as próprias parcelas | Sim | Sim |
| Criar talhões/parcelas **extras** (não planejados) | Sim | Sim |
| Editar/apagar planejado | Sim | Não |
| Apagar extra | Sim | Só extra próprio, sem medições; demais casos viram "marcado como excluído" |
| Análise e suficiência amostral | Sim | Sim (por ora; reavaliar depois do piloto) |
| Exportar pacote de coleta | Sim | Sim |
| Importar pacotes, consolidar, CSV, backup geral | Sim | Não |

O PIN do perfil coordenador é uma trava de uso, não segurança forte (app 100% cliente).

## 3. Navegação

Tela inicial **Projetos** (mantida). Dentro de um projeto aberto, quatro abas, nesta ordem:

**Cadastro | Coleta | Análise | Dados**

- **Acesso a Projetos:** o cabeçalho (nome do projeto) fica sempre visível e tem um botão **Projetos**. Ele abre a tela de Projetos sem fechar o projeto atual; ali, um botão **Voltar** (e o próprio projeto aberto, destacado na lista) retorna à última aba usada, com o estado preservado. Projetos não faz parte do ciclo de deslize entre abas.
- Ao abrir um projeto que já tem parcela em andamento, o app entra direto na **Coleta**; projeto novo abre em **Cadastro**.

- **Decisão após o teste no celular (05/11/2026):** a navegação entre abas é **só por toque** na barra de abas. O deslize lateral foi implementado, testado em campo e removido: exigia muitas condições para não atrapalhar a digitação e era difícil de acertar com o dedo. Pode ser reavaliado no futuro.
- **Status:** a estrutura de quatro abas (Cadastro, Coleta, Análise, Dados) e a Coleta enxuta estão implementadas na versão 1.4.0 (branch `feature/navegacao`). Ainda **não** implementados: perfis coordenador/coletor, pacotes de campo, UUID nas medições, licença do app e mapa offline.

## 4. Abas

### Coleta (mínimo na tela)
- Cabeçalho enxuto: `Talhão · Parcela · n árvores`.
- Linha (se habilitada no projeto), Árvore (numeração automática, − / +), **CAP** (campo grande, teclado numérico, foco automático), **Altura** (sempre disponível, opcional por árvore), Qualidade (botão `N ▾` que abre grade de letras; só se habilitada no projeto).
- Botão **Adicionar** grande, fixo acima do teclado. Enter avança CAP → Altura → confirma.
- Uma faixa com a **última leitura** e **Desfazer**.
- Selo discreto de pendências (ex.: `Faltam alturas: 3 classes`) que leva à Análise.
- Alertas curtos, em uma linha; alerta de árvore repetida na mesma linha/parcela; mantidos os alertas de CAP incomum e de DAP < 5 cm.
- Sem botões de finalizar, concluir, apagar nem contadores.

### Cadastro
- Dados do projeto/fazenda e **opções do projeto**: usar número de linha; registrar qualidade do fuste. Alterar depois que há medições exige confirmação ou é bloqueado.
- Talhões (cadastro completo) e parcelas (configuração, **marcar centro** com GPS, finalizar parcela, concluir talhão, apagar).
- Coletor: vê as próprias parcelas e cria extras (seção 6).

### Análise
- Estatísticas por parcela e por talhão, toggle DAP/CAP, histograma (classes de 2 cm iniciando em DAP 5 cm), déficit de altura e lista de árvores elegíveis.
- **Suficiência amostral por área basal, apenas no projeto** (seção 8).

### Dados (salvar, exportar, importar)
- **Salvar:** backup JSON do projeto no aparelho, com lembrete no fim do dia.
- **Exportar:** coletor exporta o **pacote de coleta** (compartilhar por WhatsApp via compartilhamento do sistema, com opção de salvar o arquivo); coordenador também exporta CSVs (medições, parcelas, talhões) e backup geral.
- **Importar:** coordenador importa pacotes das equipes e vê os recibos; coletor importa o pacote de campo e restaura backup do próprio aparelho.

## 5. Modelo de dados (uma única migração, banco v3)

- Medições passam de ID numérico automático para **UUID**. Toda medição leva `equipeId`, `aparelhoId`, `usuario` e versão do app.
- Parcela: `origem` (`planejada` | `extra`), `equipeId`, `centro` { lat, lon, precisao, timestamp } opcional, `excluida` (marca lógica).
- Talhão: `origem`, `equipeId`, `excluido` (marca lógica).
- Projeto: opções `usarLinha`, `usarQualidade`.
- Nenhuma coordenada por leitura nem track (descartado: o operador do aparelho fica parado enquanto o colega mede).

## 6. Extras criados pelo coletor

- Recebem UUID e etiqueta visível, ex.: `Extra · Equipe B · 1`, evitando colisão de numeração entre equipes.
- Seguem no pacote com a marca "não planejado" e aparecem como **pendências** na importação.
- O coordenador decide, para cada extra: aceitar como novo, associar a talhão existente ou renumerar. Nada é descartado automaticamente.

## 7. Pacotes e importação

- **Pacote de campo** (coordenador → equipe): projeto, opções, talhões/parcelas atribuídos, licença da equipe.
- **Pacote de coleta** (equipe → coordenador): tudo o que a equipe criou ou mediu, com identificação de equipe/aparelho.
- Importação **idempotente por UUID**: importar o mesmo pacote duas vezes não duplica nem apaga nada.
- Ao importar, o app gera um **recibo** (contagem + hash). O app da equipe só oferece limpar dados locais depois que o recibo for confirmado.
- Arquivos grandes (se houver fotos no futuro) podem exigir compactação ou divisão por dia por causa do limite do WhatsApp.

## 8. Suficiência amostral — área basal (só no projeto)

- g = π/4 · DAP² (m², DAP em cm ÷ 10.000). G (m²/ha) = Σg ÷ área da parcela × 10.000, com árvores de DAP ≥ 5 cm.
- Unidade amostral é a **parcela**: CV% de G entre todas as parcelas do projeto, em conjunto (sem estratificar por talhão).
- n necessário = t²·CV²/E², com correção de população finita (N = soma das áreas dos talhões ÷ área da parcela). Se algum talhão não tiver área, o app avisa e usa a fórmula sem correção.
- Exibe n necessário, n atual e parcelas que faltam. Erro admissível e confiança configuráveis; padrão definido: erro admissível 10% com 95% de confiança.

## 9. Proteção do aplicativo

- Tirar o app do endereço público (hospedagem atrás de login, repositório privado) para impedir novas cópias.
- **Licença assinada por equipe, com validade**, verificada offline; vencida a data, a coleta deixa de abrir.
- Aviso de direitos autorais no código e na tela.
- Limites: quem já instalou ainda tem o app; relógio do aparelho pode ser atrasado; só o contrato cobre uso indevido.

## 10. GPS

- Um ponto por parcela (centro), gravado por botão. A API de geolocalização funciona sem internet; a primeira leitura do dia pode demorar. A precisão (5–15 m sob copa) é gravada junto.
- Mapa de fundo offline é **indispensável** no piloto: base **OpenStreetMap**, em pacote da área gerado pelo coordenador num computador e distribuído junto ao pacote de campo.
- Cuidados do OSM: o servidor público de tiles (`tile.openstreetmap.org`) **não deve ser usado para baixar em massa nem como fonte do app**; o pacote é gerado a partir dos dados do OSM (extrato da região). A licença exige **atribuição** ("© colaboradores do OpenStreetMap") visível no mapa.
- O OSM é mapa de ruas e feições, sem imagem aérea; a precisão da cobertura da fazenda (estradas internas, talhões) pode ser baixa, e por isso os talhões e parcelas do cadastro são desenhados por cima.

## 11. Fora do escopo por ora

- Track contínuo e coordenada por leitura.
- Fotos e navegação até parcela planejada (a definir junto ao mapa).
- Coleta de alturas por classe com meta fixa (ideia futura).
- Servidor com login e sincronização automática (fase 2; o UUID e o formato de pacote já deixam o caminho aberto).

## 12. Decisões em aberto

1. ~~Erro admissível e confiança~~ — decidido: 10% / 95%.
2. Hospedagem protegida do app: hoje o responsável usa Netlify; falta confirmar se o plano dele oferece proteção por senha (ou migrar para Cloudflare Pages + Access, que tem camada gratuita).
3. ~~Fonte do mapa de fundo~~ — decidido: **OpenStreetMap** por ora (sem imagem de satélite). Em aberto: formato do pacote de mapa (proposta: extrato dos dados do OSM da região, em arquivo único gerado pelo coordenador, ex.: PMTiles) e, mais adiante, imagem de satélite ou ortomosaico do contratante como camada extra.
4. ~~Onde fica a importação de pacotes~~ — decidido: aba **Dados**.
5. ~~Se o coletor vê a Análise~~ — decidido: vê, por ora.
6. Branches: `feature/area-basal` e `feature/perfis-consolidacao`; tag `v1.1.0` na `main` antes de começar.
