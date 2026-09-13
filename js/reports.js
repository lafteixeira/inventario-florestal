import * as db from './db.js';
import { capParaDap, estatisticasParcela, estatisticasAgregadas } from './stats.js';
import { QUALIDADES } from './validation.js';

// CSV padrão (separador ',', decimal '.', UTF-8 sem BOM) — lido por pd.read_csv()
// sem nenhum parâmetro extra. Para abrir no Excel: Dados > Obter Dados > De Texto/CSV.
const SEP = ',';

function celula(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (texto.includes(SEP) || texto.includes('"') || texto.includes('\n')) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

function num(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
  return valor.toFixed(casas);
}

function linhaCsv(campos) {
  return campos.map(celula).join(SEP);
}

function nomeQualidade(id) {
  return QUALIDADES.find((q) => q.id === id)?.nome ?? '';
}

async function coletarEstrutura(fazendaId) {
  const talhoes = await db.getTalhoesDaFazenda(fazendaId);
  const estrutura = [];
  for (const talhao of talhoes) {
    const parcelas = await db.getParcelasDoTalhao(talhao.id);
    const comMedicoes = [];
    for (const parcela of parcelas) {
      const medicoes = await db.getMedicoesDaParcela(parcela.id);
      comMedicoes.push({ parcela, medicoes });
    }
    estrutura.push({ talhao, parcelas: comMedicoes });
  }
  return estrutura;
}

// Relatório 1: medições brutas (substitui a planilha de campo) — uma linha por árvore.
export async function gerarCsvMedicoes(fazenda) {
  const estrutura = await coletarEstrutura(fazenda.id);
  const linhas = [
    linhaCsv([
      'Talhão', 'Parcela', 'Linha', 'Árvore', 'CAP (cm)', 'DAP (cm)',
      'Altura (m)', 'Qualidade', 'Falha', 'Registrado em',
    ]),
  ];
  for (const { talhao, parcelas } of estrutura) {
    for (const { parcela, medicoes } of parcelas) {
      for (const m of [...medicoes].sort((a, b) => a.id - b.id)) {
        linhas.push(
          linhaCsv([
            talhao.numero,
            parcela.numero,
            m.linha,
            m.arvore,
            m.falha ? '' : num(m.cap, 1),
            m.falha ? '' : num(capParaDap(m.cap), 2),
            m.altura != null ? num(m.altura, 2) : '',
            nomeQualidade(m.qualidade),
            m.falha ? 'Sim' : 'Não',
            m.timestamp || '',
          ])
        );
      }
    }
  }
  return linhas.join('\r\n');
}

// Relatório 2: estatísticas por parcela (grupos "só CAP" / "CAP+altura" — seção 4 do log).
export async function gerarCsvEstatisticasParcelas(fazenda) {
  const estrutura = await coletarEstrutura(fazenda.id);
  const linhas = [
    linhaCsv([
      'Talhão', 'Parcela', 'Área (m2)', 'Status',
      'n só CAP', 'DAP médio só CAP (cm)',
      'n CAP+altura', 'DAP médio CAP+altura (cm)', 'CV% (CAP+altura)', 'Erro% (CAP+altura)',
      'Altura média (m)', 'CV% altura', 'Erro% altura', 'Falhas',
    ]),
  ];
  for (const { talhao, parcelas } of estrutura) {
    for (const { parcela, medicoes } of parcelas) {
      const s = estatisticasParcela(medicoes);
      linhas.push(
        linhaCsv([
          talhao.numero,
          parcela.numero,
          num(parcela.area, 1),
          parcela.status === 'concluida' ? 'Concluída' : 'Em andamento',
          s.soCap.n,
          num(s.soCap.media, 1),
          s.comAltura.n,
          num(s.comAltura.media, 1),
          num(s.comAltura.cv, 1),
          num(s.comAltura.erro, 1),
          num(s.alturaMedia.media, 2),
          num(s.alturaMedia.cv, 1),
          num(s.alturaMedia.erro, 1),
          s.falhas,
        ])
      );
    }
  }
  return linhas.join('\r\n');
}

// Relatório 3: estatísticas por talhão + linha "GERAL" com o consolidado da fazenda.
export async function gerarCsvEstatisticasTalhoes(fazenda) {
  const estrutura = await coletarEstrutura(fazenda.id);
  const linhas = [
    linhaCsv([
      'Talhão', 'Status', 'Parcelas', 'Árvores válidas', 'Falhas',
      'DAP médio (cm)', 'Altura média (m)', 'CV% (DAP)', 'Erro% (DAP)',
    ]),
  ];

  let todasMedicoes = [];
  let totalParcelas = 0;
  for (const { talhao, parcelas } of estrutura) {
    const medicoesTalhao = parcelas.flatMap((p) => p.medicoes);
    todasMedicoes = todasMedicoes.concat(medicoesTalhao);
    totalParcelas += parcelas.length;
    const s = estatisticasAgregadas(medicoesTalhao);
    linhas.push(
      linhaCsv([
        talhao.numero,
        talhao.status === 'concluido' ? 'Concluído' : 'Em andamento',
        parcelas.length,
        s.n,
        s.falhas,
        num(s.dap.media, 1),
        num(s.altura.media, 2),
        num(s.dap.cv, 1),
        num(s.dap.erro, 1),
      ])
    );
  }

  const geral = estatisticasAgregadas(todasMedicoes);
  linhas.push(
    linhaCsv([
      'GERAL', '', totalParcelas, geral.n, geral.falhas,
      num(geral.dap.media, 1),
      num(geral.altura.media, 2),
      num(geral.dap.cv, 1),
      num(geral.dap.erro, 1),
    ])
  );
  return linhas.join('\r\n');
}

export function baixarCsv(nomeArquivo, conteudo) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
