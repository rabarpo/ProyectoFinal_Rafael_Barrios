// Fixture de DEMO — NO es parte del producto ni del seed estructural.
//
// Genera un caso de prueba manual sobre una base ya sembrada con `prisma/seed.ts`:
//   - Un proceso de Municipio Escolar ABIERTO (31/08/2026 -> 05/09/2026), resultados VISIBLES.
//   - 3 listas con 1 candidato cabeza de lista cada una.
//   - Padrón de 15 estudiantes en el aula semilla (1ro A - mañana), incluido `seed-estudiante`.
//   - 10 votos ya emitidos, repartidos en distintas horas del 31/08 y 01/09, para que el
//     panel de jornada / dashboard tenga una curva de participación realista.
//   - `seed-estudiante` queda SIN votar: es el derecho que usarás para la prueba manual.
//
// Idempotente: re-ejecutarlo borra el proceso de demo anterior (y sus votos/derechos/listas)
// y lo vuelve a crear desde cero. Los usuarios y matrículas de demo se conservan.
//
// Uso (dentro del contenedor backend):
//   docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml \
//     exec backend pnpm exec tsx prisma/seed-caso-prueba.ts

const NOMBRE_PROCESO = 'CASO DE PRUEBA — Municipio Escolar 2026';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('El fixture de demo no puede ejecutarse con NODE_ENV=production.');
    process.exit(1);
  }

  const { PrismaClient, RolUsuario } = await import('@prisma/client');
  const { randomUUID } = await import('node:crypto');
  const prisma = new PrismaClient();

  try {
    // ── 1. Contexto académico (creado por prisma/seed.ts) ──────────────────────
    const anio = await prisma.anioEscolar.findFirst({ where: { activo: true } });
    if (!anio) throw new Error('No hay AnioEscolar activo. Corré primero: pnpm exec tsx prisma/seed.ts');

    const aula = await prisma.aula.findFirst({
      where: { anio_escolar_id: anio.id },
      include: { grado: true, seccion: true },
    });
    if (!aula) throw new Error('No hay Aula en el año activo. Corré primero el seed estructural.');

    // ── 2. Padrón: seed-estudiante + 14 estudiantes de demo, todos matriculados ──
    const estudiantesDemo: { codigo: string; dni: string; correo: string; nombres: string }[] = [
      { codigo: 'seed-estudiante', dni: '00000001', correo: 'seed.estudiante@seei.local', nombres: 'Estudiante Semilla' },
    ];
    const nombresPila = [
      'Ana', 'Bruno', 'Camila', 'Diego', 'Elena', 'Fabio', 'Gabriela',
      'Hugo', 'Irene', 'Julián', 'Karla', 'Luis', 'Marta', 'Nicolás',
    ];
    for (let i = 0; i < 14; i++) {
      const n = String(i + 1).padStart(2, '0');
      estudiantesDemo.push({
        codigo: `caso-est-${n}`,
        dni: String(20000000 + i + 1),
        correo: `caso.est${n}@seei.local`,
        nombres: `${nombresPila[i]} Apellido${n}`,
      });
    }

    const usuarios: { id: string; codigo: string }[] = [];
    for (const e of estudiantesDemo) {
      const u = await prisma.usuario.upsert({
        where: { codigo: e.codigo },
        update: {},
        create: {
          nombres: e.nombres,
          dni: e.dni,
          codigo: e.codigo,
          correo: e.correo,
          rol: RolUsuario.estudiante,
          estado: 'activo',
        },
      });
      await prisma.matricula.upsert({
        where: {
          usuario_id_aula_id_anio_escolar_id: {
            usuario_id: u.id,
            aula_id: aula.id,
            anio_escolar_id: anio.id,
          },
        },
        update: {},
        create: { usuario_id: u.id, aula_id: aula.id, anio_escolar_id: anio.id },
      });
      usuarios.push({ id: u.id, codigo: e.codigo });
    }

    // ── 3. Limpiar una corrida anterior del fixture ────────────────────────────
    const previo = await prisma.procesoElectoral.findFirst({ where: { nombre: NOMBRE_PROCESO } });
    if (previo) {
      await prisma.jobCorreo.deleteMany({ where: { proceso_id: previo.id } });
      await prisma.notificacion.deleteMany({ where: { proceso_id: previo.id } });
      await prisma.voto.deleteMany({ where: { proceso_id: previo.id } });
      await prisma.derechoVoto.deleteMany({ where: { proceso_id: previo.id } });
      await prisma.candidato.deleteMany({ where: { proceso_id: previo.id } });
      await prisma.lista.deleteMany({ where: { proceso_id: previo.id } });
      await prisma.procesoAula.deleteMany({ where: { proceso_id: previo.id } });
      await prisma.procesoElectoral.delete({ where: { id: previo.id } });
      console.log('Fixture anterior eliminado.');
    }

    // ── 4. Proceso de Municipio Escolar, ABIERTO, resultados visibles ──────────
    const aperturaReal = new Date('2026-08-31T13:00:00.000Z'); // ~08:00 America/Lima
    const proceso = await prisma.procesoElectoral.create({
      data: {
        nombre: NOMBRE_PROCESO,
        descripcion: 'Elección del Municipio Escolar — caso de prueba para demostración del dashboard.',
        tipo: 'municipio',
        estado: 'abierto',
        fecha_apertura_prevista: new Date('2026-08-31T13:00:00.000Z'),
        fecha_cierre_prevista: new Date('2026-09-05T22:00:00.000Z'),
        apertura_real: aperturaReal,
        ocultar_resultados: false,
        publico_objetivo: 'estudiantes',
        alcance: 'institucion',
      },
    });
    await prisma.procesoAula.create({ data: { proceso_id: proceso.id, aula_id: aula.id } });

    // ── 5. Listas + candidato cabeza de lista ──────────────────────────────────
    const definicionListas = [
      { numero: 1, nombre: 'Lista 1 — Unidad Estudiantil', lema: 'Todos por el cambio', candidato: 'Sofía Ramírez' },
      { numero: 2, nombre: 'Lista 2 — Fuerza Joven', lema: 'Energía para el colegio', candidato: 'Mateo Fernández' },
      { numero: 3, nombre: 'Lista 3 — Voz del Aula', lema: 'Escuchamos a todos', candidato: 'Valeria Castro' },
    ];
    const listas: { id: string; numero: number }[] = [];
    for (const d of definicionListas) {
      const lista = await prisma.lista.create({
        data: {
          proceso_id: proceso.id,
          nombre: d.nombre,
          numero: d.numero,
          lema: d.lema,
          simbolo: ['★', '⚡', '🗣️'][d.numero - 1],
          propuesta: `Plan de trabajo de ${d.nombre}: más talleres, recreos activos y un mural del estudiante.`,
        },
      });
      await prisma.candidato.create({
        data: {
          proceso_id: proceso.id,
          lista_id: lista.id,
          nombres: d.candidato,
          cargo: 'Alcalde escolar',
          grado: `${aula.grado.nombre} ${aula.seccion.nombre}`,
          aula: `${aula.turno}`,
        },
      });
      listas.push({ id: lista.id, numero: d.numero });
    }

    // ── 6. Derechos de voto (padrón congelado) ─────────────────────────────────
    await prisma.derechoVoto.createMany({
      data: usuarios.map((u) => ({
        proceso_id: proceso.id,
        usuario_id: u.id,
        en_calidad_de: 'estudiante',
        aula_snapshot: aula.id,
      })),
    });
    const derechos = await prisma.derechoVoto.findMany({
      where: { proceso_id: proceso.id },
      select: { id: true, usuario_id: true },
    });
    const derechoPorUsuario = new Map(derechos.map((d) => [d.usuario_id, d.id]));

    // ── 7. 10 votos históricos en distintas horas ──────────────────────────────
    //   votantes = los 14 de demo; `seed-estudiante` NO vota (queda para la prueba manual)
    const votantes = usuarios.filter((u) => u.codigo !== 'seed-estudiante').slice(0, 10);
    const [l1, l2, l3] = listas;
    const plan: { lista_id: string | null; blanco: boolean; hora: string }[] = [
      { lista_id: l1.id, blanco: false, hora: '2026-08-31T13:20:00Z' },
      { lista_id: l1.id, blanco: false, hora: '2026-08-31T13:45:00Z' },
      { lista_id: l1.id, blanco: false, hora: '2026-08-31T14:30:00Z' },
      { lista_id: l1.id, blanco: false, hora: '2026-08-31T15:10:00Z' },
      { lista_id: l1.id, blanco: false, hora: '2026-08-31T16:05:00Z' },
      { lista_id: l2.id, blanco: false, hora: '2026-08-31T18:40:00Z' },
      { lista_id: l2.id, blanco: false, hora: '2026-08-31T20:15:00Z' },
      { lista_id: l2.id, blanco: false, hora: '2026-08-31T22:05:00Z' },
      { lista_id: l3.id, blanco: false, hora: '2026-09-01T01:30:00Z' },
      { lista_id: null, blanco: true, hora: '2026-09-01T03:50:00Z' },
    ];

    for (let i = 0; i < votantes.length; i++) {
      const votante = votantes[i];
      const p = plan[i];
      const derechoId = derechoPorUsuario.get(votante.id)!;
      const votoId = randomUUID();
      const codigo = `CASO-${String(i + 1).padStart(4, '0')}`;
      await prisma.voto.create({
        data: {
          id: votoId,
          proceso_id: proceso.id,
          derecho_voto_id: derechoId,
          lista_id: p.lista_id,
          blanco: p.blanco,
          codigo_comprobante: codigo,
          clave_idempotencia: randomUUID(),
          hora_servidor: new Date(p.hora),
        },
      });
      await prisma.jobCorreo.create({
        data: {
          usuario_id: votante.id,
          voto_id: votoId,
          proceso_id: proceso.id,
          codigo_comprobante: codigo,
          asunto: 'Comprobante de tu voto',
          cuerpo: `Tu voto fue registrado. Código: ${codigo}. Hora: ${p.hora}.`,
          estado: 'enviado',
        },
      });
    }

    // ── 8. Reporte ────────────────────────────────────────────────────────────
    console.log('');
    console.log('  Caso de prueba creado');
    console.log('  ─────────────────────');
    console.log(`  Proceso   : ${NOMBRE_PROCESO}`);
    console.log(`  id        : ${proceso.id}`);
    console.log(`  Estado    : abierto  (31/08/2026 → 05/09/2026, resultados VISIBLES)`);
    console.log(`  Aula      : ${aula.turno} · ${aula.grado.nombre} ${aula.seccion.nombre}`);
    console.log(`  Padrón    : ${usuarios.length} estudiantes`);
    console.log(`  Votos     : 10 emitidos  (Lista 1: 5 · Lista 2: 3 · Lista 3: 1 · blanco: 1)`);
    console.log(`  Pendientes: ${usuarios.length - 10}  (incluye seed-estudiante)`);
    console.log('');
    console.log('  Para la prueba manual: entrá como seed-estudiante / seed-password-dev-2026');
    console.log('  y votá en este proceso desde "Mis votaciones".');
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
