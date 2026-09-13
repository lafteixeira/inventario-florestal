import { DAP_MINIMO_INCLUSAO } from './stats.js';

// Faixas de plausibilidade (referência eucalipto — ajustáveis conforme seção 5 do log)
export const CAP_BLOQUEIO = [1, 300];
export const CAP_ALERTA = [5, 120];
export const ALTURA_BLOQUEIO = [0.5, 80];
export const ALTURA_ALERTA = [1.3, 45];

// CAP equivalente ao DAP mínimo de inclusão (seção 4 do log) — abaixo disso a
// árvore fica de fora do histograma de classes diamétricas.
const CAP_MINIMO_INCLUSAO = DAP_MINIMO_INCLUSAO * Math.PI;

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
  if (valor < CAP_MINIMO_INCLUSAO) {
    return {
      status: 'alerta',
      valor,
      mensagem: `Árvore abaixo do DAP mínimo de inclusão (${DAP_MINIMO_INCLUSAO} cm). Ela será registrada, mas não entra no histograma de classes diamétricas.`,
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

// Códigos padrão de qualidade da árvore (compatível com os relatórios do
// contratante — ver planilha de referência). O código numérico é o que fica
// gravado em medicao.qualidade; a letra é o atalho que a equipe de campo usa.
export const QUALIDADES = [
  { id: 0, letra: 'N', nome: 'Árvore Normal' },
  { id: 1, letra: 'F', nome: 'Falha de Plantio' },
  { id: 2, letra: 'M', nome: 'Morta' },
  { id: 3, letra: 'S', nome: 'Suprimida' },
  { id: 4, letra: 'B', nome: 'Bifurcada acima de 1,30 metros' },
  { id: 5, letra: 'Q', nome: 'Quebrada' },
  { id: 6, letra: 'T', nome: 'Torta' },
  { id: 7, letra: 'I', nome: 'Inclinada' },
  { id: 8, letra: 'C', nome: 'Caída' },
  { id: 9, letra: 'P', nome: 'Ponta Seca' },
  { id: 10, letra: 'W', nome: 'Falha de brotação (Toco)' },
  { id: 13, letra: 'Y', nome: 'Bifurcada abaixo de 1,30 metros' },
];

// "Falha de Plantio" (F) é o equivalente a CAP=0 (posição vazia na linha) —
// seção 5 do log: registra automaticamente quando o CAP digitado é 0.
export const QUALIDADE_FALHA = 1;
