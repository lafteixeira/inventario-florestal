# Log do Projeto — Inventário Florestal (PWA)

**Última atualização deste documento:** 13/09/2026
**Versão atual do app:** 1.1.0 (ver `js/versao.js`)
**Status:** em uso para testes de campo com equipe

---

## 1. Descrição geral

Aplicativo web (PWA — Progressive Web App) para substituir a coleta de dados de inventário florestal em papel/planilha por um formulário digital offline, usado em tablets/celulares Android em campo. Registra a hierarquia **Fazenda (projeto) → Talhão → Parcela → Árvore**, converte CAP em DAP e monta a distribuição diamétrica da parcela em tempo real, indicando durante a própria coleta em quais classes diamétricas ainda faltam medições de altura — e agora, exatamente quais árvores.

Contexto de referência original: Fazenda Ibítira, plantios de eucalipto, contratante CENSUS Ambiental (compatibilidade de códigos e formato de exportação pensada para esse fluxo de trabalho).

Especificação original validada por um protótipo interativo antes do desenvolvimento (ver `log-app-inventario-florestal.md`, o log de especificação inicial). Este documento (`LOG-PROJETO.md`) é o log vivo do que foi efetivamente construído, mantido dentro do próprio repositório.

## 2. Objetivo

- Registrar a hierarquia fazenda → talhão → parcela → árvore.
- Converter CAP em DAP e montar a distribuição diamétrica da parcela em tempo real.
- Indicar, durante a coleta, em quais classes diamétricas (e em quais árvores especificamente) ainda faltam medições de altura.
- Ser robusto contra perda de dados — funciona 100% offline, sem depender de conexão com internet.
- Consolidar estatísticas em três níveis: parcela, talhão e geral (todos os talhões da fazenda).
- Suportar múltiplos projetos (fazendas) no mesmo aparelho.
- Exportar dados em formato pronto para processamento posterior em Python (pandas/Google Colab) e para backup/restauração entre aparelhos.

## 3. Stack tecnológica

- **PWA em HTML/JS puro** (vanilla, sem framework, sem bundler/build step) + **IndexedDB** para persistência local.
- Módulos ES nativos do navegador (`<script type="module">` / `import`/`export`), sem etapa de compilação.
- **Service Worker** para cache do app shell e funcionamento offline (não cacheia dados — dados ficam só no IndexedDB do aparelho).
- Sem backend/servidor de dados: tudo roda no navegador, hospedado como site estático.
- Ambiente de desenvolvimento: Claude Code (modelo Sonnet 5).

## 4. Arquitetura / estrutura de arquivos

```
inventario-florestal/
├── index.html              # shell da página, registra o Service Worker
├── manifest.json           # metadados do PWA (instalável)
├── sw.js                   # Service Worker: cache do app shell, atualização manual
├── serve.py                # servidor estático simples p/ desenvolvimento local
├── css/styles.css
├── icons/                  # ícones do PWA (SVG)
└── js/
    ├── app.js               # bootstrap, roteamento entre Projetos/Coleta/Parcelas/Talhões
    ├── db.js                 # camada de dados: IndexedDB (schema, CRUD, migrações)
    ├── validation.js         # faixas de plausibilidade, parsing, códigos de Qualidade
    ├── stats.js               # motor estatístico (DAP, classes, CV%, erro amostral, sugestões)
    ├── export.js              # backup/restauração em JSON
    ├── reports.js             # exportação de relatórios em CSV
    ├── confirmacao.js         # modal de confirmação próprio (substitui window.confirm)
    ├── versao.js               # número da versão exibido no app
    ├── atualizacao.js          # registro do Service Worker + atualização manual
    └── screens/
        ├── projetos.js         # tela inicial: criar/abrir/apagar projetos, backup, versão
        ├── coleta.js            # tela de coleta em campo
        ├── parcelas.js          # análise por parcela
        └── talhoes.js           # consolidação por talhão / geral, exportação de relatórios
```

## 5. Modelo de dados (IndexedDB — banco `inventario-florestal`, versão 2)

| Store | Chave | Índices | Descrição |
|---|---|---|---|
| `fazendas` | `id` | — | Um registro por projeto: nome, município, UF, contratante, endereço, responsável técnico, `criadoEm` |
| `talhoes` | `id` | `fazendaId`, `numero` | numero (sequencial contínuo por fazenda), status (`em_andamento`/`concluido`), dataInicio/dataConclusao, e cadastro: nome, área (ha), materialGenetico, espacamento, regimeSilvicultural, dataPlantio, rotacao, observacoes |
| `parcelas` | `id` | `talhaoId`, `fazendaId`, `numero` | numero (sequencial contínuo por fazenda, não reinicia por talhão), forma (retangular/circular), dimensões, área calculada, status |
| `medicoes` | `id` (auto) | `parcelaId` | linha, arvore, cap, altura (nullable), qualidade (código 0–13), falha (boolean), timestamp (ISO 8601) |
| `meta` | `chave` | — | Só guarda `fazendaAtualId` (qual projeto está aberto) — ver seção 8 |

**Migração v1 → v2:** ao suportar múltiplos projetos, parcelas antigas (sem `fazendaId` próprio) são preenchidas automaticamente a partir do `fazendaId` do seu talhão, na própria abertura do banco (`db.js`, `onupgradeneeded`).

**Numeração:** o próximo número de talhão/parcela é sempre calculado por consulta ao banco (`MAX(numero)+1`, escopado por fazenda) — nunca mantido em memória, evitando desalinhamento se o app fechar no meio da coleta.

## 6. Funcionalidades por tela

### Projetos (tela inicial)
- Lista os projetos cadastrados (cartões com nome, município/UF, contratante, nº de talhões).
- Criar novo projeto: formulário de cadastro (nome obrigatório; município, UF, contratante/cliente, endereço, responsável técnico opcionais). Abre direto no projeto recém-criado.
- Abrir um projeto existente (retoma exatamente onde a coleta parou — ver seção 8).
- Apagar um projeto (cascata: talhão → parcelas → medições), com confirmação.
- Exportar backup de um projeto específico ou de todos os projetos (JSON).
- Importar backup completo (substitui todos os dados do aparelho), com confirmação.
- Versão do app e botão "Verificar atualizações" (seção 9).

### Coleta (foco: entrada de dados em campo, sem distrações)
- Cadastro do talhão (nome, área, material genético, espaçamento, regime silvicultural, data de plantio, rotação, observações) — **seção recolhível**: some nome informado, mostra "Talhão N"; trava depois da primeira medição do talhão; começa expandida enquanto precisa ser preenchida, recolhida depois de travar (o operador pode reabrir a qualquer momento).
- Configuração da parcela (forma retangular/circular, dimensões, área calculada) — mesma lógica de seção recolhível/trava; pré-preenchida a partir da parcela anterior.
- Formulário de medição: linha, árvore (pré-preenchidos automaticamente), CAP, altura (+ toggle "somar 1,30 m automaticamente"), qualidade (12 códigos — seção 7).
- Contador em tempo real: árvores sem altura / com altura / falhas.
- Alerta de classes diamétricas com déficit de altura, **expresso em CAP** (o que o operador mede em campo, não DAP).
- Botões: Desfazer última medição, Finalizar parcela (mantém forma/dimensões, numeração contínua), Concluir talhão (fecha parcelas pendentes, avança numeração de talhão).

### Parcelas (análise detalhada)
- Seletor de parcela do talhão atual (inclui a em andamento e as já finalizadas).
- Toggle **DAP / CAP** para a unidade de exibição das estatísticas (CV% e erro amostral não mudam — são invariantes de escala).
- Estatísticas separadas: "Só CAP (sem altura)" e "CAP + altura" (n, média, desvio, CV%, erro amostral), mais "Altura média".
- Histograma sobreposto (barra sólida "toda a parcela" vs. contorno "com altura"), na unidade selecionada.
- Alerta de classes com déficit de altura (sempre em CAP) **+ lista exata das árvores elegíveis** (linha/árvore/CAP) para a próxima medição de altura — a lista some/recalcula conforme as alturas vão sendo preenchidas.
- Tabela de medições da parcela com edição inline (qualquer campo, inclusive corrigir uma Falha) e exclusão por linha.
- Apagar a parcela selecionada (cascata: medições junto), com confirmação.

### Talhões (consolidação)
- Toggle DAP/CAP (mesma lógica da tela Parcelas).
- Resumo geral da fazenda: nº de talhões, parcelas, árvores válidas, falhas, DAP/CAP médio, altura média, CV%, erro amostral.
- Tabela de talhões (concluídos e o atual), cada linha expansível mostrando o detalhamento por parcela.
- Apagar um talhão (cascata: parcelas + medições), com confirmação.
- Exportação de relatórios em CSV (seção 10).

## 7. Códigos de Qualidade da árvore

Padrão de 12 categorias, compatível com os relatórios do contratante:

| Código | Descrição |
|---|---|
| 0 - N | Árvore Normal |
| 1 - F | Falha de Plantio *(equivalente a CAP = 0 — ver seção 8)* |
| 2 - M | Morta |
| 3 - S | Suprimida |
| 4 - B | Bifurcada acima de 1,30 metros |
| 5 - Q | Quebrada |
| 6 - T | Torta |
| 7 - I | Inclinada |
| 8 - C | Caída |
| 9 - P | Ponta Seca |
| 10 - W | Falha de brotação (Toco) |
| 13 - Y | Bifurcada abaixo de 1,30 metros |

## 8. Regras de validação e robustez dos dados

- CAP e altura aceitam vírgula ou ponto como separador decimal.
- **CAP = 0** → registrada automaticamente como código 1 (Falha de Plantio/posição vazia). Não passa pelas faixas de plausibilidade, fica fora do cálculo de DAP/classes/estatísticas, mas continua na tabela de medições para rastreabilidade.
- Faixas de plausibilidade (referência eucalipto, ajustáveis em `validation.js`):
  - CAP: bloqueio fora de 1–300 cm; alerta (confirmação) fora de 5–120 cm.
  - Altura: bloqueio fora de 0,5–80 m; alerta fora de 1,3–45 m.
- Valor incomum (dentro do bloqueio, fora do alerta) exige confirmação: segundo clique em "Adicionar medição" sem alterar o valor confirma; editar o campo cancela a pendência.
- Toggle "somar 1,30 m automaticamente": soma antes de validar/usar nas estatísticas (leitura à altura do peito).
- Cada gravação (medição, finalizar parcela, concluir talhão, apagar) é uma transação IndexedDB própria e imediata — sem acumular em memória antes de persistir.
- **Estado "em andamento" derivado dos dados**, não de um ponteiro salvo à parte: o talhão/parcela atuais são sempre o de maior número com `status = 'em_andamento'` (função `getTalhaoEmAndamento`/`getParcelaEmAndamento` em `db.js`). Isso corrigiu um bug real do início do suporte a múltiplos projetos (um ponteiro global único fazia o app confundir o talhão atual ao alternar entre projetos).
- Confirmações destrutivas (apagar projeto/talhão/parcela/medição, importar backup) usam um modal próprio (`confirmacao.js`), não `window.confirm()` — o confirm nativo do navegador é bloqueado/ignorado em PWAs instalados em modo standalone no Android, o que fazia os botões de apagar parecerem não funcionar.

## 9. Motor estatístico (metodologia)

Implementado em `js/stats.js`:

- **DAP (cm) = CAP (cm) / π**.
- **DAP mínimo de inclusão: 5 cm** (`DAP_MINIMO_INCLUSAO`) — critério de campo: árvores abaixo disso não entram no histograma de classes diamétricas nem nas análises por classe (déficit de altura, árvores elegíveis). Continuam gravadas na tabela de medições e nas estatísticas agregadas (n, média geral), só ficam fora da distribuição por classe. Um contador na tela Parcelas avisa quantas árvores da parcela ficaram abaixo do mínimo.
- Classes diamétricas de amplitude fixa de 2 cm, **ancoradas no DAP mínimo de inclusão** (`classeDiametrica`) — a primeira classe do histograma é sempre `[5, 7)`, não `[0, 2)`; rótulo em CAP calculado como `classe × π` arredondado (`classeLabelCap`), já que o operador mede CAP em campo.
- Na tela Coleta, um CAP cujo DAP calculado fique abaixo de 5 cm dispara um alerta de confirmação (mesmo padrão dos demais valores incomuns): a árvore é registrada normalmente, só avisa que ela não entrará no histograma.
- Estatísticas descritivas (`estatisticasDescritivas`): n, média, desvio padrão amostral (n−1), CV% (desvio/média×100), erro amostral E% usando **t de Student** por grau de liberdade (tabela embutida para 1–30 gl; aproximação normal z=1,96 acima disso — sem depender de biblioteca externa, app 100% offline).
- **Estatísticas por parcela** (`estatisticasParcela`): grupos disjuntos "só CAP" (sem altura) e "CAP + altura", mais altura média a partir do subconjunto com altura medida.
- **Estatísticas agregadas** (`estatisticasAgregadas`, usada em Talhões/geral): DAP combinado de todas as árvores válidas + altura média do subconjunto com altura.
- **Sugestão de mais medições de altura** (`classesComDeficitDeAltura`): compara, por classe diamétrica, o % que a classe representa na parcela toda vs. o % que representa entre as árvores já com altura medida; diferença acima de um limiar (3 pontos percentuais, ajustável) sinaliza a classe como prioritária.
- **Árvores elegíveis para medir altura** (`arvoresParaMedirAltura`): a partir do déficit por classe, filtra exatamente as árvores só-CAP que pertencem a uma classe em déficit — a lista exata de candidatas para a próxima medição, agrupada por classe na ordem de prioridade.
- Toggle de exibição DAP/CAP nas telas Parcelas/Talhões: conversão por fator π aplicada só a médias/desvios — CV% e erro amostral são invariantes de escala (mesmos valores nas duas unidades).
- Árvores marcadas como Falha são excluídas de todos os cálculos acima, mas contam em um contador separado.

## 10. Exportação de dados

- **Backup/restauração (JSON)** — `export.js`: backup completo (todos os projetos) ou de um projeto específico; usado para troca de aparelho ou recuperação. Importação substitui os dados do aparelho (com confirmação).
- **Relatórios (CSV)** — `reports.js`, na tela Talhões:
  - Medições (uma linha por árvore: talhão, parcela, linha, árvore, CAP, DAP, altura, qualidade, falha, timestamp).
  - Estatísticas por parcela.
  - Estatísticas por talhão (+ linha "GERAL" consolidando a fazenda).
  - Formato: separador `,`, decimal `.`, UTF-8 **sem BOM**, timestamp em ISO 8601 — lido por `pd.read_csv()` sem nenhum parâmetro extra (pensado para a próxima etapa do inventário em Python/pandas no Google Colab). Para abrir no Excel: Dados → Obter Dados → De Texto/CSV.

## 11. PWA, offline e atualização de versão

- `manifest.json` + `sw.js` tornam o app instalável (ícone na tela inicial, tela cheia).
- Service Worker cacheia só o app shell (HTML/CSS/JS/ícones) — nunca os dados, que ficam só no IndexedDB local.
- **Atualização é sempre manual**, nunca automática (importante para não trocar a versão do app no meio de uma coleta em campo):
  - `sw.js` não chama `skipWaiting()` na instalação — uma versão nova baixada em segundo plano fica "esperando".
  - Tela Projetos → "Verificar atualizações" checa se há versão nova (só baixa, não aplica); se houver, mostra "Atualizar agora", que só então ativa a nova versão e recarrega.
  - Versão exibida (`js/versao.js`) e nome do cache do Service Worker (`sw.js`, string literal — de propósito, não importada de outro módulo, pois o navegador só detecta atualização comparando os bytes do próprio `sw.js`) são mantidos manualmente em sincronia a cada release.

## 12. Implantação

- Repositório: `https://github.com/lafteixeira/inventario-florestal` (branch `main`).
- Publicado via **GitHub Pages**: `https://lafteixeira.github.io/inventario-florestal/`.
- Sem processo de build — o próprio conteúdo do repositório é servido estaticamente.
- Ambiente de desenvolvimento local: `serve.py` (servidor Python simples, `Cache-Control: no-store` para evitar servir JS desatualizado durante o desenvolvimento) + `.claude/launch.json`.

## 13. Histórico de atualizações

| Data | Commit | Entrega |
|---|---|---|
| 12/09/2026 | `93faf89` | **Fundação do PWA**: estrutura IndexedDB, validações, motor estatístico inicial, tela Coleta completa, manifest + Service Worker. Primeiro deploy no GitHub Pages. |
| 12/09/2026 | `c7617c3` | **Multi-projeto**: suporte a múltiplos projetos/fazendas (migração de banco v1→v2), cadastro de fazenda (município, UF, contratante, endereço, responsável técnico), tela inicial "Projetos", telas Parcelas e Talhões com motor estatístico completo (t de Student, histograma), exportação CSV compatível com pandas (correção de um formato anterior pensado só para Excel, que corrompia a leitura em Python). |
| 13/09/2026 | `6c2394b` | Cadastro do talhão (nome, área, material genético, espaçamento, regime silvicultural, data de plantio, rotação, observações); alerta de déficit de altura passa a ser expresso em CAP; toggle DAP/CAP nas estatísticas de Parcelas e Talhões. |
| 13/09/2026 | `f13e874` | Apagar projeto/talhão/parcela (exclusão em cascata); seções "Cadastro do talhão" e "Configuração da parcela" tornam-se recolhíveis na tela Coleta, para reduzir distração durante a coleta em campo. |
| 13/09/2026 | `15df1a2` | Correção crítica: `window.confirm()` é bloqueado em PWA instalado em modo standalone no Android, fazendo os botões de apagar parecerem não funcionar. Substituído por modal de confirmação próprio (`confirmacao.js`) em todos os pontos do app. |
| 13/09/2026 | `5658f89` | Lista exata de árvores elegíveis para medição de altura (linha/árvore/CAP) na tela Parcelas, além do alerta por classe já existente. |
| 13/09/2026 | `7eabfae` | Códigos de Qualidade atualizados para o padrão de 12 categorias do contratante (substituindo a lista provisória de 5 categorias inicial). |
| 13/09/2026 | `a80628f` | Versão do app explícita na tela Projetos + atualização 100% manual do Service Worker (nunca aplica uma versão nova sozinho) — preparação para os testes de campo com a equipe. |
| 13/09/2026 | *(pendente)* | Primeiro ajuste vindo do teste de campo: histograma de classes diamétricas passa a começar no DAP mínimo de inclusão (5 cm) em vez de zero, mantendo amplitude de 2 cm; alerta na tela Coleta quando o CAP digitado resulta em DAP abaixo desse mínimo; nota na tela Parcelas informando quantas árvores da parcela ficaram fora da distribuição por esse motivo. Versão 1.1.0. |

## 14. Limitações conhecidas / próximos passos

- Faixas de plausibilidade de CAP/altura calibradas para eucalipto — ajustar se houver talhões com outras espécies/idades.
- Limiar de déficit de altura (3 pontos percentuais) e as próprias faixas de plausibilidade ainda precisam de validação em campo com a coleta piloto.
- Erro amostral usa t de Student via tabela embutida (1–30 graus de liberdade) + aproximação normal acima disso — não uma biblioteca estatística completa.
- Exportação de relatórios é CSV genérico (medições, estatísticas por parcela/talhão) — não replica ainda um template de relatório formatado específico do contratante, caso um dia seja necessário.
- App é local por aparelho (sem sincronização automática entre dispositivos); troca de aparelho ou consolidação de dados de várias equipes depende do backup/restauração manual em JSON.
- Sem autenticação/controle de acesso — qualquer pessoa com o link e o aparelho tem acesso total aos dados locais dele.

## 15. Referências

- `log-app-inventario-florestal.md` — log de especificação original (pré-desenvolvimento), com o raciocínio de escolha de tecnologia e as premissas validadas no protótipo interativo.
- Código-fonte: ver seção 4 (estrutura de arquivos) e o histórico de commits do repositório para o detalhe de cada mudança.
