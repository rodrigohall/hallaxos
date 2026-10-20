/** "Hoje" no fuso da Hallax (Dourados-MS): o copiloto precisa dele para entender
 *  "hoje", "ontem" e "sexta passada", e o registro para datar o que foi feito —
 *  não pode vir do relógio UTC do VPS, que vira o dia às 20h de lá. */
export function hojeEmDourados(agora = new Date()): { data: string; semana: string } {
  const fuso = "America/Campo_Grande";
  return {
    data: new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(agora),
    semana: new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "long" }).format(agora),
  };
}
