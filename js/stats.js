export const AMPLITUDE_CLASSE = 2; // cm — seção 4 do log

export function capParaDap(cap) {
  return cap / Math.PI;
}

// Retorna o limite inferior da classe diamétrica de um DAP (amplitude fixa).
export function classeDiametrica(dap, amplitude = AMPLITUDE_CLASSE) {
  return Math.floor(dap / amplitude) * amplitude;
}

export function classeLabel(inicioClasse, amplitude = AMPLITUDE_CLASSE) {
  return `${inicioClasse}-${inicioClasse + amplitude}`;
}

// Medições válidas (não-falha) com DAP calculado, para uso pelas funções abaixo.
export function medicoesValidasComDap(medicoes) {
  return medicoes
    .filter((m) => !m.falha)
    .map((m) => ({ ...m, dap: capParaDap(m.cap) }));
}

function contarPorClasse(itens) {
  const contagem = new Map();
  for (const item of itens) {
    const classe = classeDiametrica(item.dap);
    contagem.set(classe, (contagem.get(classe) || 0) + 1);
  }
  return contagem;
}

// Distribuição relativa (%) por classe diamétrica — usada no histograma sobreposto.
export function distribuicaoPercentual(itens) {
  const total = itens.length;
  const contagem = contarPorClasse(itens);
  const classes = [...contagem.keys()].sort((a, b) => a - b);
  return classes.map((classe) => ({
    classe,
    label: classeLabel(classe),
    percentual: total > 0 ? (contagem.get(classe) / total) * 100 : 0,
    quantidade: contagem.get(classe),
  }));
}

// Classes onde a proporção de árvores com altura medida está defasada em relação
// à proporção da classe na parcela toda (seção 4 do log — sugestão de mais alturas).
export function classesComDeficitDeAltura(medicoesValidas, limiar = 3) {
  const total = medicoesValidas.length;
  if (total === 0) return [];

  const comAltura = medicoesValidas.filter((m) => m.altura != null);
  const totalComAltura = comAltura.length;

  const contagemTodas = contarPorClasse(medicoesValidas);
  const contagemComAltura = contarPorClasse(comAltura);

  const classes = [...contagemTodas.keys()].sort((a, b) => a - b);

  return classes
    .map((classe) => {
      const pctTodas = (contagemTodas.get(classe) / total) * 100;
      const pctComAltura =
        totalComAltura > 0 ? ((contagemComAltura.get(classe) || 0) / totalComAltura) * 100 : 0;
      return {
        classe,
        label: classeLabel(classe),
        pctTodas,
        pctComAltura,
        diferenca: pctTodas - pctComAltura,
      };
    })
    .filter((c) => c.diferenca > limiar)
    .sort((a, b) => b.diferenca - a.diferenca);
}

// t de Student bicaudal, 95% de confiança, por grau de liberdade (n-1).
// Acima de 30 graus de liberdade usa a aproximação normal (z = 1,96) — seção 7 do log.
const TABELA_T = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function valorT(grausLiberdade) {
  if (grausLiberdade < 1) return null;
  if (grausLiberdade > TABELA_T.length) return 1.96;
  return TABELA_T[grausLiberdade - 1];
}

// n, média, desvio padrão amostral, CV% e erro amostral (E%) de um conjunto de valores.
export function estatisticasDescritivas(valores) {
  const n = valores.length;
  if (n === 0) return { n: 0, media: null, desvio: null, cv: null, erro: null };
  const media = valores.reduce((a, b) => a + b, 0) / n;
  const variancia =
    n > 1 ? valores.reduce((acc, v) => acc + (v - media) ** 2, 0) / (n - 1) : 0;
  const desvio = Math.sqrt(variancia);
  const cv = media !== 0 ? (desvio / media) * 100 : null;
  const t = n > 1 ? valorT(n - 1) : null;
  const erro = n > 1 && media !== 0 ? ((t * desvio) / Math.sqrt(n) / media) * 100 : null;
  return { n, media, desvio, cv, erro };
}

// Estatísticas da tela "Parcelas": grupos separados "só CAP" (sem altura) e "CAP + altura"
// (seção 4 do log), mais a altura média a partir do subconjunto com altura medida.
export function estatisticasParcela(medicoes) {
  const validas = medicoesValidasComDap(medicoes);
  const falhas = medicoes.filter((m) => m.falha).length;
  const soCap = validas.filter((m) => m.altura == null);
  const comAltura = validas.filter((m) => m.altura != null);
  return {
    n: validas.length,
    falhas,
    soCap: estatisticasDescritivas(soCap.map((m) => m.dap)),
    comAltura: estatisticasDescritivas(comAltura.map((m) => m.dap)),
    alturaMedia: estatisticasDescritivas(comAltura.map((m) => m.altura)),
  };
}

// Estatísticas agregadas (talhão/geral, seção 6 do log): DAP médio combinado
// (todas as árvores válidas) + altura média a partir do subconjunto com altura.
export function estatisticasAgregadas(medicoes) {
  const validas = medicoesValidasComDap(medicoes);
  const falhas = medicoes.filter((m) => m.falha).length;
  const comAltura = validas.filter((m) => m.altura != null);
  return {
    n: validas.length,
    falhas,
    dap: estatisticasDescritivas(validas.map((m) => m.dap)),
    altura: estatisticasDescritivas(comAltura.map((m) => m.altura)),
  };
}
