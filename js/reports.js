import * as db from './db.js';
import { capParaDap, estatisticasParcela, estatisticasAgregadas } from './stats.js';
import { QUALIDADES } from './validation.js';

// Delimitador ';' e decimal ',' — abre corretamente no Excel em configuração pt-BR.
const SEP = ';';

function celula(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (texto.includes(SEP) || texto.includes('"') || texto.includes('\n')) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

function numPt(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
  return valor.toFixed(casas).replace('.', ',');
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
            m.falha ? '' : numPt(m.cap, 1),
            m.falha ? '' : numPt(capParaDap(m.cap), 2),
            m.altura != null ? numPt(m.altura, 2) : '',
            nomeQualidade(m.qualidade),
            m.falha ? 'Sim' : 'Não',
            m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR') : '',
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
      'Talhão', 'Parcela', 'Área (m²)', 'Status',
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
          numPt(parcela.area, 1),
          parcela.status === 'concluida' ? 'Concluída' : 'Em andamento',
          s.soCap.n,
          numPt(s.soCap.media, 1),
          s.comAltura.n,
          numPt(s.comAltura.media, 1),
          numPt(s.comAltura.cv, 1),
          numPt(s.comAltura.erro, 1),
          numPt(s.alturaMedia.media, 2),
          numPt(s.alturaMedia.cv, 1),
          numPt(s.alturaMedia.erro, 1),
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
        numPt(s.dap.media, 1),
        numPt(s.altura.media, 2),
        numPt(s.dap.cv, 1),
        numPt(s.dap.erro, 1),
      ])
    );
  }

  const geral = estatisticasAgregadas(todasMedicoes);
  linhas.push(
    linhaCsv([
      'GERAL', '', totalParcelas, geral.n, geral.falhas,
      numPt(geral.dap.media, 1),
      numPt(geral.altura.media, 2),
      numPt(geral.dap.cv, 1),
      numPt(geral.dap.erro, 1),
    ])
  );
  return linhas.join('\r\n');
}

export function baixarCsv(nomeArquivo, conteudo) {
  const BOM = '﻿'; // garante acentuação correta ao abrir no Excel
  const blob = new Blob([BOM + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
