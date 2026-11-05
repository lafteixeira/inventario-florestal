# Log do Projeto — Inventário Florestal (PWA)

**Última atualização deste documento:** 13/09/2026
**Versão atual do app:** 1.4.2, na `main` (tag `v1.4.2`; versões anteriores marcadas: `v1.1.0`) — ver `js/versao.js`
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

### Estrutura de abas (versão 1.4.0)
Dentro de um projeto aberto há quatro abas, nesta ordem: **Cadastro | Coleta | Análise | Dados**. A navegação é só por toque na barra de abas (o deslize lateral foi testado e removido: atrapalhava mais do que ajudava no campo). O botão **Projetos** fica sempre no topo e, na tela Projetos, o botão **Voltar** retorna à última aba usada. Projeto novo abre em Cadastro; projeto com leituras na parcela em andamento abre direto na Coleta.

### Cadastro
- **Opções do projeto**: usar número da linha, registrar qualidade do fuste, somar 1,30 m na altura digitada (as duas primeiras também são escolhidas na criação do projeto; desligar uma faz o campo sumir da Coleta). Mudar com medições já gravadas pede confirmação e vale só para as próximas leituras.
- Cadastro do talhão (nome, área, material genético, espaçamento, regime silvicultural, data de plantio, rotação, observações); trava depois da primeira medição. Um talhão novo já nasce pré-preenchido com material, espaçamento, regime, plantio e rotação do anterior.
- Configuração da parcela (forma, dimensões, área calculada), pré-preenchida a partir da parcela anterior; trava depois da primeira medição.
- **Marcar centro da parcela (GPS)**: grava latitude, longitude, precisão (m) e hora na parcela atual (vai para o CSV de parcelas). O GPS só funciona em https.
- Finalizar parcela (abre a próxima e vai para a Coleta) e Concluir talhão (abre um novo), ambos com confirmação.
- Lista de talhões e parcelas com **Apagar** (cascata, com confirmação).

### Coleta (só digitação, uso na vertical)
- Layout compacto para caber na metade da tela que sobra com o teclado aberto (testado com 420 px de altura): topo reduzido (some o nome do app com projeto aberto), Linha (se habilitada) e Árvore com botões − / + e números grandes; trocar de linha propõe a próxima árvore daquela linha; **CAP e Altura lado a lado**, teclado numérico; Qualidade em botão que abre uma grade de letras (volta para N a cada árvore).
- **Fluxo pelo OK do teclado, sem botão Adicionar:** OK no CAP confere e passa para a Altura; OK na Altura (com ou sem valor) registra a árvore e volta ao CAP. CAP = 0 registra Falha direto. CAP vazio ou inválido não avança.
- Faixa com a **última leitura** e **Desfazer**; selo "Faltam alturas em N classe(s)" que leva à Análise.
- Alertas curtos de uma linha, com confirmação por segundo OK: CAP/altura incomuns, DAP abaixo de 5 cm, árvore repetida na mesma linha/parcela.
- Sem cadastro, contadores nem botões de finalizar/concluir (tudo isso fica no Cadastro). Todos os campos desligam as sugestões do teclado (autocomplete, autocorreção, corretor).

### Análise
- Alternador **Por parcela | Talhões e projeto**.
- Por parcela: seletor de talhão e de parcela; toggle DAP/CAP; estatísticas "Só CAP" e "CAP + altura"; área basal (G); histograma sobreposto; déficit de altura (em CAP) com lista exata das árvores elegíveis; tabela de medições com edição inline e exclusão por linha.
- Talhões e projeto: resumo geral, **suficiência amostral por área basal (nível do projeto)** e tabela de talhões expansível por parcela.

### Dados
- **Salvar**: backup JSON do projeto ou de todos os projetos.
- **Exportar**: relatórios CSV (medições, estatísticas por parcela, estatísticas por talhão — seção 10).
- **Importar**: restaura um backup (substitui os dados do aparelho), com confirmação.


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
- **Área basal** (`areaBasalArvore`, `areaBasalPorHa`): g = π/4·DAP² (m²); G (m²/ha) = Σg ÷ área da parcela × 10.000, só árvores com DAP ≥ 5 cm, falhas fora. Mostrada na tela Parcelas e na coluna `G (m2/ha)` do CSV de parcelas.
- **Suficiência amostral** (`suficienciaAmostral`), **só no nível do projeto** (card na tela Talhões): unidade amostral = parcela concluída (a em andamento não entra); CV% de G entre parcelas; n = t²·CV²·N / (N·E² + t²·CV²), com t iterado por n−1 gl (95% de confiança) e N = área total dos talhões ÷ área média das parcelas. Se algum talhão não tiver área, usa a fórmula sem correção e avisa. Erro admissível padrão 10%, editável na tela. Quando a iteração oscila entre dois valores, adota o maior (conservador).
- Toggle de exibição DAP/CAP nas telas Parcelas/Talhões: conversão por fator π aplicada só a médias/desvios — CV% e erro amostral são invariantes de escala (mesmos valores nas duas unidades).
- Árvores marcadas como Falha são excluídas de todos os cálculos acima, mas contam em um contador separado.

## 10. Exportação de dados

- **Backup/restauração (JSON)** — `export.js`: backup completo (todos os projetos) ou de um projeto específico; usado para troca de aparelho ou recuperação. Importação substitui os dados do aparelho (com confirmação).
- **Relatórios (CSV)** — `reports.js`, na tela Talhões:
  - Medições (uma linha por árvore: talhão, parcela, linha, árvore, CAP, DAP, altura, qualidade, falha, timestamp, "Altura somou 1.30 m" Sim/Não). Linha 0 = projeto sem registro de linha.
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
| 13/09/2026 | `9347cd1` | Primeiro ajuste vindo do teste de campo: histograma de classes diamétricas passa a começar no DAP mínimo de inclusão (5 cm) em vez de zero, mantendo amplitude de 2 cm; alerta na tela Coleta quando o CAP digitado resulta em DAP abaixo desse mínimo; nota na tela Parcelas informando quantas árvores da parcela ficaram fora da distribuição por esse motivo. Versão 1.1.0 (tag `v1.1.0`). |
| 05/11/2026 | *(branch `feature/area-basal`)* | Área basal por parcela (G, m²/ha) e suficiência amostral do projeto pela área basal (parcelas concluídas, t de Student, correção de população finita, erro admissível editável); coluna G no CSV de parcelas. Versão 1.2.0. Planejamento do piloto em `PLANO-PILOTO.md`. |
| 05/11/2026 | *(branch `feature/navegacao`)* | Navegação: deslize lateral entre as abas (ignorado em campos de texto, teclado aberto, leitura digitada e ainda não adicionada, tabelas com rolagem lateral, histograma, modal e borda da tela); botão **Projetos** sempre visível no topo, e na tela Projetos um botão grande **Voltar** que retorna à última aba usada (com o projeto marcado "aberto agora"); apagar o projeto aberto limpa o Voltar. Versão 1.3.0. (O deslize lateral foi removido na 1.4.0 depois do teste no celular.) |
| 05/11/2026 | *(branch `feature/navegacao`)* | **Reestruturação em quatro abas (Cadastro, Coleta, Análise, Dados), versão 1.4.0**, a partir do primeiro teste de campo no celular: Coleta enxuta (campos grandes, steppers, Enter no CAP adiciona, qualidade em grade de letras, Adicionar fixo acima do teclado, última leitura + Desfazer, alertas curtos, aviso de árvore repetida); Cadastro com opções do projeto (linha, qualidade, somar 1,30 m), talhão novo pré-preenchido, centro da parcela por GPS, finalizar/concluir/apagar; Análise (parcela e projeto) com seletor de talhão; aba Dados (salvar, exportar, importar); sugestões do teclado desligadas; só toque nas abas (sem deslize). Não inclui ainda perfis coordenador/coletor, pacotes de campo, UUID nas medições, licença do app nem mapa. |
| 05/11/2026 | *(branch `feature/navegacao`)* | **1.4.2 — rastreabilidade na gravação**: projeto sem linha grava **linha = 0** ("linha não medida", em vez de repetir 1, 1, 1); projeto sem qualidade grava Normal (código 0); cada medição passa a ter o campo `somou130` (a altura gravada já inclui +1,30 m somado na digitação, arredondada a 2 casas); na tabela de medições a altura somada aparece em negrito/âmbar com "+" e legenda, e o CSV de medições ganhou a coluna `Altura somou 1.30 m` (Sim/Não). Corrigir a altura à mão na edição desliga a marca. |
| 05/11/2026 | *(branch `feature/navegacao`)* | **1.4.1 — Coleta compacta para o teclado aberto**, após o segundo teste no celular: CAP e Altura lado a lado; steppers de Linha/Árvore com números legíveis; topo reduzido; botão Adicionar removido; OK no CAP vai para a Altura e OK na Altura registra a árvore e volta ao CAP. |

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
