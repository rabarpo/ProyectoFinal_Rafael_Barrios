// Helper de DEMO — borra el voto de un usuario en el proceso de caso de prueba para poder
// repetir la votación manual. NO es parte del producto.
//
// Uso:
//   docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml \
//     exec backend pnpm exec tsx prisma/demo-reset-voto.ts [codigo-usuario]
// (por defecto: seed-estudiante)

const NOMBRE_PROCESO = 'CASO DE PRUEBA — Municipio Escolar 2026';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('No ejecutar con NODE_ENV=production.');
    process.exit(1);
  }

  const codigoUsuario = process.argv[2] ?? 'seed-estudiante';
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const proceso = await prisma.procesoElectoral.findFirst({ where: { nombre: NOMBRE_PROCESO } });
    if (!proceso) throw new Error(`No existe el proceso "${NOMBRE_PROCESO}".`);

    const votos = await prisma.voto.findMany({
      where: {
        proceso_id: proceso.id,
        derechoVoto: { usuario: { codigo: codigoUsuario } },
      },
      select: { id: true, codigo_comprobante: true, hora_servidor: true },
    });

    if (votos.length === 0) {
      console.log(`${codigoUsuario} no tiene ningún voto en "${NOMBRE_PROCESO}". Nada que borrar.`);
      return;
    }

    const votoIds = votos.map((v) => v.id);

    await prisma.$transaction(async (tx) => {
      const jobs = await tx.jobCorreo.findMany({ where: { voto_id: { in: votoIds } }, select: { id: true } });
      const jobIds = jobs.map((j) => j.id);
      await tx.notificacion.deleteMany({ where: { job_correo_id: { in: jobIds } } });
      await tx.jobCorreo.deleteMany({ where: { voto_id: { in: votoIds } } });
      // EventoAuditoria es append-only (el rol seei_app no tiene DELETE): el evento VOTO del
      // primer voto queda registrado a propósito. No se borra.
      await tx.voto.deleteMany({ where: { id: { in: votoIds } } });
    });

    console.log(`Borrado(s) ${votos.length} voto(s) de ${codigoUsuario} en "${NOMBRE_PROCESO}":`);
    for (const v of votos) {
      console.log(`  - ${v.codigo_comprobante}  (${v.hora_servidor.toISOString()})`);
    }
    console.log('Su derecho de voto queda disponible para votar de nuevo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
