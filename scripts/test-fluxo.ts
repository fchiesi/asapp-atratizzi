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
  const recP1 = await fin.listarRecebimentos({ pedidoId: "P-0001" });
  assert.deepEqual(recP1.map((r) => [r.categoria, r.valor]).sort(), [["entrada_50", 860], ["saldo_50", 860]]);
  const orc1 = (await com.listarOrcamentos()).find((o) => o.id === "O-0001");
  assert.equal(orc1?.status, "pedido");
  ok("amostra R$ 80 recebida, aprovacao gerou P-0001 de R$ 1.720 com entrada e saldo de R$ 860");

  const ap2 = await com.aprovarOrcamento("O-0002", quem);
  assert.equal((await fin.listarRecebimentos({ pedidoId: ap2.pedidoId })).length, 0, "prazo28 so cobra na entrega");
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
  await prod.registrarRotina({ maquina: "R1", tipo: "flush" }, quem);
  const painel = await prod.painelProducao();
  const r1 = painel.maquinas.find((m) => m.maquina === "R1")!;
  assert.equal(r1.metrosHoje, 60);
  assert.equal(r1.flushHoje, true);
  assert.equal(r1.horasParadasHoje, 2);
  assert.equal(painel.maquinas.find((m) => m.maquina === "R2")!.flushHoje, false);
  ok("apontamento move pedido p/ em producao, aviso >110%, parada e flush aparecem no painel");

  // 5. entrega
  await com.alterarPedido("P-0001", { status: "entregue", nf: "000123" }, quem);
  p1 = (await com.listarPedidos()).find((p) => p.id === "P-0001")!;
  assert.equal(p1.status, "entregue");
  assert.equal(p1.dataEntrega, hoje);
  assert.equal(p1.nf, "000123", "NF mantem zeros");
  const saldo = (await fin.listarRecebimentos({ pedidoId: "P-0001" })).find((r) => r.categoria === "saldo_50")!;
  assert.equal(saldo.dataVenc, hoje);
  await assert.rejects(com.alterarPedido("P-0001", { status: "na_fila" }, quem), ErroNegocio);
  await com.alterarPedido(ap2.pedidoId, { status: "entregue" }, quem);
  const unico = (await fin.listarRecebimentos({ pedidoId: ap2.pedidoId }))[0];
  assert.equal(unico?.categoria, "unico");
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
  assert.equal(ind.producao.find((p) => p.maquina === "R1")!.horasParadas, 2);
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

  // 9. a planilha guardou data como data de verdade
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
