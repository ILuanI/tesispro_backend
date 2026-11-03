// Legacy regression fixtures now create AND explicitly approve their schedules.
// Approval behavior itself is exercised without this helper in test-payment-schedules.
import {randomBytes,createHash} from 'node:crypto';

// Older financial regression cases use this explicit two-person fixture flow.
// R14 permission and pending-state tests call the endpoints directly without it.
export async function verifiedFixturePayment(db,base,path,body,headers={}) {
  const [{name}]=await db.query('SELECT current_schema() AS name');
  if(!name.includes('_test_')) throw new Error('Solo se permiten fixtures en esquemas de prueba.');
  let [sales]=await db.query("SELECT id_usuario FROM usuario_interno WHERE correo='r14-fixture-sales@example.test'");
  if(!sales) [sales]=await db.query("INSERT INTO usuario_interno(nombres,apellidos,correo,rol) VALUES('Registro','Fixture','r14-fixture-sales@example.test','asesor_comercial') RETURNING id_usuario");
  const token=randomBytes(32).toString('hex');
  await db.query("INSERT INTO sesion_admin(token_hash,id_usuario,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),sales.id_usuario]);
  const registration=await fetch(base+path,{method:'POST',headers:{...headers,'Content-Type':'application/json',Cookie:`tesispro_session=${token}`},body:JSON.stringify(body)});
  if(!registration.ok)return registration;
  const p=await registration.clone().json();
  if(p.estado!=='pendiente')return registration;
  const verified=await fetch(`${base}/admin/pagos/${p.idPago}/decision`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({estado:'confirmado',motivo:'Verificación independiente de fixture',claveIdempotencia:body.claveIdempotencia})});
  if(verified.status===409) {
    // These legacy tests continue with an approved schedule, so explicitly resolve
    // their deliberately invalid receipt. R14 itself tests retaining the incident.
    await fetch(`${base}/admin/pagos/${p.idPago}/decision`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({estado:'rechazado',motivo:'Incidencia resuelta en fixture de regresión',claveIdempotencia:body.claveIdempotencia})});
  }
  return verified;
}
export async function historicalPaymentFixture(db,sql,params) {
  const [{name}]=await db.query('SELECT current_schema() AS name');
  if(!name.includes('_test_'))throw new Error('Solo se permiten fixtures históricos en esquemas de prueba.');
  return db.transaction(async m=>{
    await m.query('ALTER TABLE pago DISABLE TRIGGER cronograma_validar_pago');
    const result=await m.query(sql,params);
    await m.query('ALTER TABLE pago ENABLE TRIGGER cronograma_validar_pago');
    return result;
  });
}
export async function scheduleFixtureBody(db, path, method, body) {
  if (
    !['POST', 'PATCH'].includes(method) ||
    !/^\/admin\/contratos\/\d+\/cronograma$/.test(path) ||
    !body
  )
    return body;
  await db.query(
    "UPDATE modalidad_pago SET activa=true,regla_activacion='primer_abono' WHERE id_modalidad=2",
  );
  const id = path.split('/')[3];
  const [root] = await db.query(
    'SELECT revision FROM cronograma_pago WHERE id_contrato=$1',
    [id],
  );
  const { saldo: ignored, ...rest } = body;
  void ignored;
  return {
    idModalidad: 2,
    revision: method === 'PATCH' ? (root?.revision ?? 0) : 0,
    motivo: 'Distribución autorizada de fixture',
    ...rest,
  };
}
export async function approveFixtureSchedule(
  base,
  cookie,
  origin,
  path,
  method,
  response,
) {
  if (
    method !== 'POST' ||
    !/^\/admin\/contratos\/\d+\/cronograma$/.test(path) ||
    response.status !== 201
  )
    return;
  const result = await response.clone().json();
  for (const [index, accion] of ['solicitar', 'aprobar'].entries()) {
    const action = await fetch(
      `${base}${path}/versiones/${result.idVersion}/acciones`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          revision: result.revision + index,
          accion,
          motivo: 'Aprobación explícita de fixture',
        }),
      },
    );
    if (!action.ok)
      throw new Error('Aprobación de fixture: ' + (await action.text()));
  }
}
