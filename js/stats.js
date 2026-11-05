export const AMPLITUDE_CLASSE = 2; // cm — seção 4 do log

// DAP mínimo para uma árvore entrar no inventário (critério de inclusão do campo,
// não é sobre plausibilidade de digitação — ver CAP_ALERTA em validation.js).
// O histograma de classes diamétricas é ancorado nesse valor: a primeira classe
// exibida é sempre [DAP_MINIMO_INCLUSAO, DAP_MINIMO_INCLUSAO + amplitude).
export const DAP_MINIMO_INCLUSAO = 5;

// Identificação da árvore na tela: "L3/A12", ou só "A12" quando o projeto não
// registra linha (linha gravada como 0 = "linha não medida").
export function rotuloArvore({ linha, arvore }) {
  return linha > 0 ? `L${linha}/A${arvore}` : `A${arvore}`;
}

export function capParaDap(cap) {
  return cap / Math.PI;
}

// Retorna o limite inferior da classe diamétrica de um DAP, ancorado em `minimo`
// (amplitude fixa) — assim o histograma sempre começa exatamente no DAP mínimo
// de inclusão, em vez de em classes múltiplas de `amplitude` a partir de zero.
export function classeDiametrica(dap, amplitude = AMPLITUDE_CLASSE, minimo = DAP_MINIMO_INCLUSAO) {
  return Math.floor((dap - minimo) / amplitude) * amplitude + minimo;
}

// Árvores que atendem o critério de inclusão (DAP mínimo) — só essas entram no
// histograma de classes diamétricas e nas análises por classe.
export function arvoresIncluidas(itens) {
  return itens.filter((item) => item.dap >= DAP_MINIMO_INCLUSAO);
}

export function classeLabel(inicioClasse, amplitude = AMPLITUDE_CLASSE) {
  return `${inicioClasse}-${inicioClasse + amplitude}`;
}

// Mesma classe (definida em DAP), rotulada em CAP — o que o operador mede em campo.
export function classeLabelCap(inicioClasse, amplitude = AMPLITUDE_CLASSE) {
  const inicioCap = Math.round(inicioClasse * Math.PI);
  const fimCap = Math.round((inicioClasse + amplitude) * Math.PI);
  return `${inicioCap}-${fimCap}`;
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
// Só considera árvores dentro do critério de inclusão (DAP mínimo).
export function distribuicaoPercentual(itens) {
  const incluidas = arvoresIncluidas(itens);
  const total = incluidas.length;
  const contagem = contarPorClasse(incluidas);
  const classes = [...contagem.keys()].sort((a, b) => a - b);
  return classes.map((classe) => ({
    classe,
    label: classeLabel(classe),
    labelCap: classeLabelCap(classe),
    percentual: total > 0 ? (contagem.get(classe) / total) * 100 : 0,
    quantidade: contagem.get(classe),
  }));
}

// Classes onde a proporção de árvores com altura medida está defasada em relação
// à proporção da classe na parcela toda (seção 4 do log — sugestão de mais alturas).
export function classesComDeficitDeAltura(medicoesValidas, limiar = 3) {
  const incluidas = arvoresIncluidas(medicoesValidas);
  const total = incluidas.length;
  if (total === 0) return [];

  const comAltura = incluidas.filter((m) => m.altura != null);
  const totalComAltura = comAltura.length;

  const contagemTodas = contarPorClasse(incluidas);
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
        labelCap: classeLabelCap(classe),
        pctTodas,
        pctComAltura,
        diferenca: pctTodas - pctComAltura,
      };
    })
    .filter((c) => c.diferenca > limiar)
    .sort((a, b) => b.diferenca - a.diferenca);
}

// Árvores só-CAP (sem altura) que pertencem a uma classe em déficit — a lista
// exata de candidatas para a próxima medição de altura, agrupada por classe
// na mesma ordem de prioridade de classesComDeficitDeAltura.
export function arvoresParaMedirAltura(medicoesValidas, limiar = 3) {
  const deficit = classesComDeficitDeAltura(medicoesValidas, limiar);
  const incluidas = arvoresIncluidas(medicoesValidas);
  return deficit.map((d) => ({
    classe: d.classe,
    labelCap: d.labelCap,
    diferenca: d.diferenca,
    arvores: incluidas
      .filter((m) => m.altura == null && classeDiametrica(m.dap) === d.classe)
      .sort((a, b) => a.linha - b.linha || a.arvore - b.arvore),
  }));
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

// Área basal de uma árvore (m²) a partir do DAP em cm: g = π/4 · DAP².
export function areaBasalArvore(dapCm) {
  return (Math.PI / 4) * (dapCm / 100) ** 2;
}

// Área basal por hectare (G, m²/ha) de uma parcela: só árvores dentro do
// critério de inclusão (DAP mínimo); falhas ficam de fora. Null sem área válida.
export function areaBasalPorHa(medicoes, areaParcelaM2) {
  if (!areaParcelaM2 || areaParcelaM2 <= 0) return null;
  const incluidas = arvoresIncluidas(medicoesValidasComDap(medicoes));
  const soma = incluidas.reduce((acc, m) => acc + areaBasalArvore(m.dap), 0);
  return (soma * 10000) / areaParcelaM2;
}

// Suficiência amostral pela área basal, no nível do projeto: a unidade amostral
// é a parcela. `gPorParcela` = G (m²/ha) de cada parcela concluída;
// `populacao` = nº de parcelas que cabem na área total (N), ou null se não houver
// área cadastrada em todos os talhões (aí usa a fórmula sem correção).
// n = t²·CV²·N / (N·E² + t²·CV²)  (CV e E em %), com t iterado pelos gl = n−1.
export function suficienciaAmostral(gPorParcela, populacao, erroAdmissivelPct = 10) {
  const n = gPorParcela.length;
  const d = estatisticasDescritivas(gPorParcela);
  const resultado = {
    n,
    media: d.media,
    desvio: d.desvio,
    cv: d.cv,
    erroAtual: null,
    nNecessario: null,
    faltam: null,
    populacao,
    erroAdmissivelPct,
  };
  if (n < 2 || !d.cv) return resultado;

  const comCorrecao = populacao != null && populacao > 0;
  const calc = (t) => {
    const t2cv2 = t * t * d.cv * d.cv;
    const bruto = comCorrecao
      ? (t2cv2 * populacao) / (populacao * erroAdmissivelPct ** 2 + t2cv2)
      : t2cv2 / erroAdmissivelPct ** 2;
    return Math.max(2, Math.ceil(bruto));
  };

  const t = valorT(n - 1);
  const fpc = comCorrecao ? Math.sqrt(Math.max(0, 1 - n / populacao)) : 1;
  resultado.erroAtual = ((t * d.desvio) / Math.sqrt(n)) * fpc / d.media * 100;

  let atual = calc(valorT(n - 1));
  let anterior = null;
  for (let i = 0; i < 20; i++) {
    const proximo = calc(valorT(Math.max(1, atual - 1)));
    if (proximo === atual) break;
    if (proximo === anterior) {
      atual = Math.max(atual, proximo);
      break;
    }
    anterior = atual;
    atual = proximo;
  }
  resultado.nNecessario = atual;
  resultado.faltam = Math.max(0, atual - n);
  return resultado;
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
