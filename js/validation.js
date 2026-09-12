// Faixas de plausibilidade (referência eucalipto — ajustáveis conforme seção 5 do log)
export const CAP_BLOQUEIO = [1, 300];
export const CAP_ALERTA = [5, 120];
export const ALTURA_BLOQUEIO = [0.5, 80];
export const ALTURA_ALERTA = [1.3, 45];

export function parseNumero(texto) {
  if (texto === null || texto === undefined) return NaN;
  const normalizado = String(texto).trim().replace(',', '.');
  if (normalizado === '') return NaN;
  return Number(normalizado);
}

// status: 'invalido' | 'falha' | 'bloqueado' | 'alerta' | 'ok'
export function validarCap(texto) {
  const valor = parseNumero(texto);
  if (Number.isNaN(valor) || valor < 0) {
    return { status: 'invalido', valor: null, mensagem: 'CAP inválido.' };
  }
  if (valor === 0) {
    return { status: 'falha', valor: 0, mensagem: 'CAP = 0 → registrado como Falha.' };
  }
  if (valor < CAP_BLOQUEIO[0] || valor > CAP_BLOQUEIO[1]) {
    return {
      status: 'bloqueado',
      valor,
      mensagem: `CAP fora da faixa permitida (${CAP_BLOQUEIO[0]}–${CAP_BLOQUEIO[1]} cm).`,
    };
  }
  if (valor < CAP_ALERTA[0] || valor > CAP_ALERTA[1]) {
    return {
      status: 'alerta',
      valor,
      mensagem: `CAP incomum (${valor} cm). Confira o valor — pode faltar vírgula/ponto.`,
    };
  }
  return { status: 'ok', valor, mensagem: '' };
}

// Aplica o toggle de +1,30 m antes de validar, conforme seção 5 do log.
export function validarAltura(texto, somar130) {
  if (texto === null || texto === undefined || String(texto).trim() === '') {
    return { status: 'ok', valor: null, mensagem: '' };
  }
  let valor = parseNumero(texto);
  if (Number.isNaN(valor) || valor < 0) {
    return { status: 'invalido', valor: null, mensagem: 'Altura inválida.' };
  }
  if (somar130) valor += 1.3;

  if (valor < ALTURA_BLOQUEIO[0] || valor > ALTURA_BLOQUEIO[1]) {
    return {
      status: 'bloqueado',
      valor,
      mensagem: `Altura fora da faixa permitida (${ALTURA_BLOQUEIO[0]}–${ALTURA_BLOQUEIO[1]} m).`,
    };
  }
  if (valor < ALTURA_ALERTA[0] || valor > ALTURA_ALERTA[1]) {
    return {
      status: 'alerta',
      valor,
      mensagem: `Altura incomum (${valor.toFixed(2)} m). Confirme o valor.`,
    };
  }
  return { status: 'ok', valor, mensagem: '' };
}

export const QUALIDADES = [
  { id: 1, nome: 'Normal' },
  { id: 2, nome: 'Dominada' },
  { id: 3, nome: 'Quebrada/bifurcada' },
  { id: 4, nome: 'Morta em pé' },
  { id: 5, nome: 'Falha' },
];
