/**
 * Teste do fluxo inteiro contra uma planilha EM MEMORIA (nao toca no Google):
 *   cliente -> orcamento -> amostra -> aprovacao -> apontamento -> parada ->
 *   entrega -> financeiro -> indicadores -> permissao das tools do chat
 *
 * Rodar: npx tsx scripts/test-fluxo.ts
 * (leva ~40 s: a trava de escrita espera 1,5 s por gravacao, como em producao)
 */
import assert from "node:assert/strict";
import { criarPlanilhaMemoria } from "./planilha-memoria";

process.env.SHEETS_ASAPP_ID = "memoria";

async function main() {
  const { usarClienteDeTeste } = await import("../src/lib/sheets");
  const { cliente, abas } = criarPlanilhaMemoria();
  usarClienteDeTeste(cliente);

  const com = await import("../src/lib/comercial");
  const prod = await import("../src/lib/producao");
  const fin = await import("../src/lib/financeiro");
  const { indicadoresDoMes } = await import("../src/lib/metas");
  const { hojeBR, mesAtual, somarDias, lerTabela } = await import("../src/lib/planilha");
  const { executeTool, getToolsForRole } = await import("../src/lib/tools");
  const { ErroNegocio } = await import("../src/lib/erros");
  const est = await import("../src/lib/estoque");

  const quem = "teste@asapp";
  const hoje = hojeBR();
  let passo = 0;
  const ok = (msg: string) => console.log(`  ✓ ${++passo}. ${msg}`);

  // 1. clientes
  const c1 = await com.criarCliente({ nome: "Confeccao Teste", telefone: "047 99999-0001", documento: "24.333.545/0001-88" }, quem);
  assert.equal(c1.id, "C-0001");
  const c2 = await com.criarCliente({ nome: "Marca Fiel", condicao: "prazo28" }, quem);
  assert.equal(c2.id, "C-0002");
  await assert.rejects(com.criarCliente({ nome: "confeccao teste" }, quem), ErroNegocio);
  const lidos = await com.listarClientes();
  assert.equal(lidos.find((c) => c.id === "C-0001")?.telefone, "047 99999-0001", "telefone mantem o zero");
  ok("clientes com numero sequencial, sem duplicar nome, telefone com zero a esquerda");

  // 2. orcamento com preco sugerido
  const o1 = await com.criarOrcamento({ clienteId: "C-0001", servico: "pigmento", metros: 100, estampas: 2, tecido: "viscose" }, quem);
  assert.equal(o1.id, "O-0001");
  assert.equal(o1.valor, 1800, "100 m x R$ 18");
  const o2 = await com.criarOrcamento(
    { clienteId: "C-0002", servico: "pigmento", metros: 20, estampas: 5, precoM: 17, obs: "=HYPERLINK(1)" },
    quem,
  );
  assert.ok(o2.avisos.length >= 1, "20 m < minimo de 30 m e 4 m/estampa < 5");
  assert.equal(abas.get("ORCAMENTOS")![2][16], "=HYPERLINK(1)", "obs gravada como texto (apostrofo), nao formula");
  ok(`orcamento O-0001 = R$ 1.800; aviso de minimo: "${o2.avisos[0]}"`);

  // 3. amostra cobrada -> recebida -> aprovacao com desconto e 50/50
  const am = await com.enviarAmostra("O-0001", quem);
  await assert.rejects(com.enviarAmostra("O-0001", quem), ErroNegocio);
  await fin.liquidar("recebimento", am.recebimentoId);
  const ap = await com.aprovarOrcamento("O-0001", quem);
  assert.equal(ap.pedidoId, "P-0001");
  assert.equal(ap.valorLiquido, 1720, "1800 - 80 da amostra");
  const recP1 = await fin.listarRecebimentos({ pedidoId: "O-0001" });
  assert.deepEqual(recP1.map((r) => [r.categoria, r.valor]).sort(), [["entrada_50", 860], ["saldo_50", 860]]);
  const orc1 = (await com.listarOrcamentos()).find((o) => o.id === "O-0001");
  assert.equal(orc1?.status, "pedido");
  ok("amostra R$ 80 recebida, aprovacao gerou P-0001 de R$ 1.720 com entrada e saldo de R$ 860");

  const ap2 = await com.aprovarOrcamento("O-0002", quem);
  assert.equal((await fin.listarRecebimentos({ pedidoId: "O-0002" })).length, 0, "prazo28 so cobra na entrega");
  ok(`cliente prazo28: ${ap2.pedidoId} sem cobranca na aprovacao`);

  // 4. producao
  const a1 = await prod.apontar({ pedidoId: "P-0001", maquina: "R1", etapa: "impressao", metros: 60, perda: 3 }, quem);
  assert.equal(a1.avisos.length, 0);
  let p1 = (await com.listarPedidos()).find((p) => p.id === "P-0001")!;
  assert.equal(p1.status, "em_producao");
  assert.equal(p1.maquina, "R1");
  const a2 = await prod.apontar({ pedidoId: "P-0001", maquina: "R2", etapa: "impressao", metros: 55 }, quem);
  assert.equal(a2.avisos.length, 1, "115 m de 100 m passa de 110%");
  await assert.rejects(prod.apontar({ pedidoId: "P-0001", maquina: "R3", etapa: "impressao", metros: 1 }, quem), ErroNegocio);
  await prod.registrarParada({ maquina: "R1", horas: 2, causa: "cabeca", descricao: "entupiu" }, quem);
  await prod.registrarRotina({ maquina: "R1", tipo: "flush_tinta" }, quem);
  await prod.registrarRotina({ maquina: "R1", tipo: "flush_entupimento" }, quem);
  await assert.rejects(prod.registrarRotina({ maquina: "R1", tipo: "flush" }, quem), ErroNegocio);
  const painel = await prod.painelProducao();
  const r1 = painel.maquinas.find((m) => m.maquina === "R1")!;
  assert.equal(r1.metrosHoje, 60);
  assert.equal(r1.ultimoFlush?.tipo, "flush_entupimento");
  assert.equal(r1.ultimoFlush?.dias, 0);
  assert.equal(r1.horasParadasHoje, 2);
  assert.equal(painel.maquinas.find((m) => m.maquina === "R2")!.ultimoFlush, null);
  ok("apontamento move pedido p/ em producao, aviso >110%, parada e ultimo flush com motivo no painel");

  // 5. entrega
  await com.alterarPedido("P-0001", { status: "entregue", nf: "000123" }, quem);
  p1 = (await com.listarPedidos()).find((p) => p.id === "P-0001")!;
  assert.equal(p1.status, "entregue");
  assert.equal(p1.dataEntrega, hoje);
  assert.equal(p1.nf, "000123", "NF mantem zeros");
  const saldo = (await fin.listarRecebimentos({ pedidoId: "O-0001" })).find((r) => r.categoria === "saldo_50")!;
  assert.equal(saldo.dataVenc, hoje);
  await assert.rejects(com.alterarPedido("P-0001", { status: "na_fila" }, quem), ErroNegocio);
  await com.alterarPedido(ap2.pedidoId, { status: "entregue" }, quem);
  const unico = (await fin.listarRecebimentos({ pedidoId: "O-0002" }))[0];
  assert.equal(unico?.categoria, "parcela_1/1");
  assert.equal(unico?.dataVenc, somarDias(hoje, 28));
  assert.equal(unico?.valor, 340);
  ok("entrega: data e NF gravadas, saldo vence hoje, prazo28 gera boleto de 28 dias");

  // 6. financeiro
  await fin.lancarGasto({ categoria: "tinta", credor: "Fornecedor X", valor: 500, dataVenc: hoje, pago: true }, quem);
  await fin.lancarGasto({ categoria: "energia", credor: "Celesc", valor: 900, dataVenc: somarDias(hoje, -3) }, quem);
  const entrada = recP1.find((r) => r.categoria === "entrada_50")!;
  await fin.liquidar("recebimento", entrada.id);
  const resumo = await fin.resumoFinanceiro(mesAtual());
  assert.equal(resumo.recebidoMes, 80 + 860);
  assert.equal(resumo.pagoMes, 500);
  assert.equal(resumo.gastosAtrasados.qtd, 1, "Celesc venceu ha 3 dias");
  ok(`financeiro: recebido R$ ${resumo.recebidoMes}, pago R$ ${resumo.pagoMes}, 1 gasto atrasado`);

  // 7. indicadores
  const ind = await indicadoresDoMes(mesAtual());
  const v = (k: string) => ind.indicadores.find((i) => i.chave === k)!;
  assert.equal(v("metros").valor, 120, "100 + 20 m entregues");
  assert.equal(v("preco_medio").valor, (1800 + 340) / 120);
  assert.equal(v("conversao").valor, 1, "1 amostra, 1 pedido");
  assert.equal(v("prazo").valor, 1);
  const indR1 = ind.producao.find((p) => p.maquina === "R1")!;
  assert.equal(indR1.horasParadas, 2);
  assert.equal(indR1.flushes, 2);
  assert.equal(indR1.flushesEntupimento, 1);
  assert.ok(Math.abs((v("perdas").valor ?? 0) - 3 / 118) < 1e-9);
  ok(
    `indicadores: ${v("metros").valor} m, preco medio R$ ${(v("preco_medio").valor ?? 0).toFixed(2)}, conversao 100%, perda ${(((v("perdas").valor ?? 0) * 100)).toFixed(1)}%`,
  );

  // 8. chat: permissoes das tools
  const nomes = (r: Parameters<typeof getToolsForRole>[0]) => getToolsForRole(r).map((t) => t.name);
  assert.ok(!nomes("operador").includes("consultar_gastos"));
  assert.ok(!nomes("vendedor").includes("lancar_gasto"));
  assert.ok(!nomes("socio").includes("marcar_pago"));
  assert.ok(nomes("diretoria").includes("indicadores_mes"));
  const negado = JSON.parse(await executeTool("consultar_gastos", {}, { role: "operador", email: quem }));
  assert.ok(negado.error);
  const consulta = JSON.parse(await executeTool("consultar_pedidos", { abertos: true }, { role: "vendedor", email: quem }));
  assert.equal(consulta.total, 0, "os dois pedidos foram entregues");
  const errNeg = JSON.parse(
    await executeTool("lancar_gasto", { categoria: "xyz", credor: "a", valor: 1, data_venc: hoje }, { role: "diretoria", email: quem }),
  );
  assert.match(errNeg.error, /Categoria invalida/);
  ok("tools do chat filtradas por perfil; erro de regra volta como mensagem");

  // 10. pedido manual no modelo do SApp: uma linha por desenho, parcelas 30/60
  await assert.rejects(
    com.criarPedido({ clienteId: "C-0001", linhas: [{ desenho: "x", servico: "pigmento", metros: 50 }], diasPgto: "abc" }, quem),
    ErroNegocio,
  );
  const pm = await com.criarPedido(
    {
      clienteId: "C-0001",
      pedCli: "4501",
      diasPgto: "30/60",
      vendedor: "Rep Teste",
      linhas: [
        { desenho: "Folhagem azul", tecido: "viscose", servico: "pigmento", metros: 40 },
        { desenho: "Listras", tecido: "tricoline", servico: "pigmento", metros: 60, precoM: 17.5 },
      ],
    },
    quem,
  );
  assert.equal(pm.pedCli, "4501");
  assert.equal(pm.ids.length, 2);
  assert.equal(pm.valorLiquido, 40 * 18 + 60 * 17.5);
  await assert.rejects(
    com.criarPedido({ clienteId: "C-0001", pedCli: "4501", linhas: [{ desenho: "y", servico: "pigmento", metros: 30 }] }, quem),
    ErroNegocio,
    "numero de pedido repetido",
  );
  const linhasPm = await com.listarPedidos({ pedCli: "4501" });
  assert.deepEqual(linhasPm.map((l) => l.desenho).sort(), ["Folhagem azul", "Listras"]);
  assert.equal((await fin.listarRecebimentos({ pedidoId: "4501" })).length, 0, "30/60 so cobra na entrega");
  ok(`pedido manual 4501: 2 desenhos (${pm.ids.join(", ")}), R$ ${pm.valorLiquido}, sem cobranca antes da entrega`);

  // 11. estoque: tecido do cliente libera o pedido; tinta tem saida e ajuste
  const tecidoCli = await est.criarItem({ tipo: "tecido_cliente", nome: "Tecido do cliente", unidade: "m" }, quem);
  const ciano = await est.criarItem({ tipo: "tinta", nome: "Pigmento Ciano", unidade: "L", minimo: 5, custoUnit: 200 }, quem);
  await assert.rejects(est.criarItem({ tipo: "tinta", nome: "pigmento ciano" }, quem), ErroNegocio);
  const recTec = await est.movimentar({ itemId: tecidoCli.id, tipoMov: "entrada", quantidade: 100, pedido: "4501" }, quem);
  assert.deepEqual(recTec.pedidosLiberados.sort(), [...pm.ids].sort());
  assert.ok((await com.listarPedidos({ pedCli: "4501" })).every((l) => l.status === "na_fila"));
  const entTinta = await est.movimentar(
    { itemId: ciano.id, tipoMov: "entrada", quantidade: 10, custoUnit: 210, fornecedor: "Tintas SC", vencimentoGasto: somarDias(hoje, 30) },
    quem,
  );
  assert.equal(entTinta.saldo, 10);
  assert.ok(entTinta.gastoId, "entrada com vencimento lanca conta a pagar");
  const gastoTinta = (await fin.listarGastos({ credor: "Tintas SC" }))[0];
  assert.equal(gastoTinta?.valor, 2100);
  assert.equal(gastoTinta?.categoria, "tinta");
  const said = await est.movimentar({ itemId: ciano.id, tipoMov: "saida", quantidade: 6.5, maquina: "R1" }, quem);
  assert.equal(said.saldo, 3.5);
  assert.ok(said.avisos.some((a) => a.includes("abaixo do minimo")));
  const aj = await est.movimentar({ itemId: ciano.id, tipoMov: "ajuste", quantidade: 3 }, quem);
  assert.equal(aj.saldo, 3, "ajuste grava a diferenca do inventario (-0,5)");
  await assert.rejects(est.movimentar({ itemId: ciano.id, tipoMov: "ajuste", quantidade: 3 }, quem), ErroNegocio);
  const itensEst = await est.listarItens();
  const cianoLido = itensEst.find((i) => i.id === ciano.id)!;
  assert.equal(cianoLido.saldo, 3);
  assert.equal(cianoLido.custoUnit, 210, "entrada com preco novo atualiza o custo");
  assert.equal(cianoLido.abaixoMinimo, true);
  assert.equal(itensEst.find((i) => i.id === tecidoCli.id)!.valorSaldo, 0, "tecido do cliente nao tem valor nosso");
  const consumo = await est.consumoTintaNoMes(mesAtual());
  assert.equal(consumo.total, 6.5);
  assert.equal(consumo.porMaquina.R1, 6.5);
  ok("estoque: tecido do cliente liberou o pedido, entrada lancou conta, saida/ajuste e alerta de minimo");

  // 12. entrega do pedido manual: parcelas so quando o ULTIMO desenho sai
  const [l1, l2] = pm.ids;
  await com.alterarPedido(l1, { status: "entregue" }, quem);
  assert.equal((await fin.listarRecebimentos({ pedidoId: "4501" })).length, 0, "falta um desenho");
  await com.alterarPedido(l2, { status: "entregue", nf: "000777" }, quem);
  const parcelas = await fin.listarRecebimentos({ pedidoId: "4501" });
  assert.deepEqual(
    parcelas.map((r) => [r.categoria, r.valor, r.dataVenc]),
    [
      ["parcela_1/2", 885, somarDias(hoje, 30)],
      ["parcela_2/2", 885, somarDias(hoje, 60)],
    ],
  );
  assert.equal(parcelas[0].nf, "000777");
  const indDepois = await indicadoresDoMes(mesAtual());
  const tinta1000 = indDepois.indicadores.find((i) => i.chave === "tinta_1000m")!;
  assert.equal(tinta1000.valor, Math.round((6.5 / 115) * 1000 * 100) / 100, "6,5 L em 115 m impressos");
  ok(`entrega do 2o desenho gerou 2 parcelas de R$ 885 (30 e 60 dias); tinta ${tinta1000.valor} L/1.000 m`);

  // 13. a planilha guardou data como data de verdade
  const g = abas.get("PEDIDOS")!;
  assert.equal(typeof g[1][1], "number", "DATA virou serial");
  assert.equal((await lerTabela("PEDIDOS"))[0].DATA, hoje, "e volta como DD/MM/AAAA");
  ok("datas gravadas como data na planilha e lidas de volta em DD/MM/AAAA");

  console.log(`\nTodos os ${passo} passos passaram.`);
}

main().catch((e) => {
  console.error("\nFALHOU:", e);
  process.exit(1);
});
