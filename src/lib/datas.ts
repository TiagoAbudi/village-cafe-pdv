export function dataLocalISO(data = new Date()): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function dataRecorrente(ano: number, mes: number, diaDesejado: number): string {
  if (!Number.isInteger(diaDesejado) || diaDesejado < 1 || diaDesejado > 31) {
    throw new Error('Dia de vencimento inválido.');
  }
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return dataLocalISO(new Date(ano, mes, Math.min(diaDesejado, ultimoDia)));
}

export function limitesDoDiaLocal(dataISO: string): { inicio: string; fim: string } {
  return {
    inicio: `${dataISO}T00:00:00-03:00`,
    fim: `${dataISO}T23:59:59.999-03:00`,
  };
}
