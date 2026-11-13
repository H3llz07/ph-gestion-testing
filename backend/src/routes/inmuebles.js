import { Router } from "express";
import { query } from "../lib/db.js";
import { authRequired, condominioDeLaPeticion, esRolAdministrativo, filtroInmueblePorUsuario } from "../lib/auth.js";
import { diasEntre, calcularInteresMora } from "../lib/finance.js";

const router = Router();
router.use(authRequired);

// Listado de inmuebles de la copropiedad (paginado).
router.get("/", async (req, res) => {
  const condominioId = condominioDeLaPeticion(req);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const offset = (page - 1) * limit;
  const params = [condominioId];
  if (!esRolAdministrativo(req)) {
    params.push(req.user.persona_id);
  }
  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT i.id, i.identificacion, i.torre, i.piso, i.tipo, i.area,
            i.coeficiente, i.estado, i.condominio_id,
            p.nombres AS propietario, r.nombres AS residente
       FROM inmueble i
       LEFT JOIN persona p ON p.id = i.propietario_id
       LEFT JOIN persona r ON r.id = i.residente_id
       WHERE ${filtroInmueblePorUsuario(req)}
       ORDER BY i.id
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  const totalParams = [condominioId];
  let totalWhere = "condominio_id = $1";
  if (!esRolAdministrativo(req)) {
    totalWhere += " AND (propietario_id = $2 OR residente_id = $2)";
    totalParams.push(req.user.persona_id);
  }
  const total = await query(`SELECT COUNT(*)::int AS n FROM inmueble WHERE ${totalWhere}`, totalParams);
  res.json({ page, limit, total: total.rows[0].n, inmuebles: rows });
});

// Detalle de un inmueble.
router.get("/:id", async (req, res) => {
  const condominioId = condominioDeLaPeticion(req);
  const detailParams = [req.params.id, condominioId];
  let detailScope = "i.id = $1 AND i.condominio_id = $2";
  if (!esRolAdministrativo(req)) {
    detailScope += " AND (i.propietario_id = $3 OR i.residente_id = $3)";
    detailParams.push(req.user.persona_id);
  }
  const { rows } = await query(
    `SELECT i.*, p.nombres AS propietario, r.nombres AS residente
       FROM inmueble i
       LEFT JOIN persona p ON p.id = i.propietario_id
       LEFT JOIN persona r ON r.id = i.residente_id
      WHERE ${detailScope}`,
    detailParams
  );
  if (!rows[0]) return res.status(404).json({ error: "Inmueble no encontrado" });
  res.json(rows[0]);
});

// Estado de cuenta de un inmueble (facturas con saldo + interés de mora).
router.get("/:id/estado-cuenta", async (req, res) => {
  const inmuebleId = Number(req.params.id);
  const scopeParams = [inmuebleId, condominioDeLaPeticion(req)];
  let scope = "i.id = $1 AND i.condominio_id = $2";
  if (!esRolAdministrativo(req)) {
    scope += " AND (i.propietario_id = $3 OR i.residente_id = $3)";
    scopeParams.push(req.user.persona_id);
  }

  const inm = await query(
    `SELECT i.*, c.tasa_mora_mensual, c.dias_gracia
       FROM inmueble i JOIN condominio c ON c.id = i.condominio_id
      WHERE ${scope}`,
    scopeParams
  );
  if (!inm.rows[0]) return res.status(404).json({ error: "Inmueble no encontrado" });
  const tasa = inm.rows[0].tasa_mora_mensual;

  const { rows } = await query(
    `SELECT id, periodo, fecha_emision, fecha_vencimiento, total, saldo, estado
       FROM factura
      WHERE inmueble_id = $1 AND estado <> 'Anulada'
      ORDER BY fecha_vencimiento`,
    [inmuebleId]
  );

  const hoy = new Date();
  let totalSaldo = 0;
  let totalInteres = 0;
  const facturas = rows.map((f) => {
    const diasMora = diasEntre(f.fecha_vencimiento, hoy);
    const interes = calcularInteresMora(f.saldo, diasMora, tasa);
    totalSaldo += Number(f.saldo);
    totalInteres += interes;
    return { ...f, dias_mora: diasMora > 0 ? diasMora : 0, interes_mora: interes };
  });

  res.json({
    inmueble: { id: inm.rows[0].id, identificacion: inm.rows[0].identificacion },
    facturas,
    total_saldo: totalSaldo,
    total_interes: totalInteres,
    total_a_pagar: totalSaldo + totalInteres,
  });
});

export default router;
