// Seed estructural (base-schema-and-migrations, tareas 1.13 y 4.5; design.md, sección "Seed
// estructural"). Crea datos de identidad, árbol académico y el singleton `Configuracion` (D7,
// sin ninguna columna de secreto SMTP: solo `smtp_host`/`smtp_puerto`/`smtp_remitente`, datos de
// marcador de posición).
//
// MUST NOT ejecutarse en producción (spec, "Seeds estructurales restringidos a no-producción",
// escenario `[R9a]`) — el guard corre como la PRIMERA sentencia ejecutable, antes de importar
// `PrismaClient` o abrir cualquier conexión, para que el rechazo no dependa de que Prisma no
// haya intentado conectar todavía.
//
// Idempotente vía `upsert` por clave natural (spec, "Seeds estructurales..."), para poder
// reejecutarlo sobre una base de dev ya sembrada sin duplicar filas.

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('El seed estructural no puede ejecutarse con NODE_ENV=production.');
    process.exit(1);
  }

  const { PrismaClient, RolUsuario, Turno } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const anioEscolar = await prisma.anioEscolar.upsert({
      where: { nombre: '2026' },
      update: { activo: true },
      create: { nombre: '2026', activo: true },
    });

    const nivel = await prisma.nivel.upsert({
      where: { nombre: 'Primaria' },
      update: {},
      create: { nombre: 'Primaria' },
    });

    const grado = await prisma.grado.upsert({
      where: { nivel_id_nombre: { nivel_id: nivel.id, nombre: '1ro' } },
      update: {},
      create: { nivel_id: nivel.id, nombre: '1ro' },
    });

    const seccion = await prisma.seccion.upsert({
      where: {
        grado_id_anio_escolar_id_nombre: {
          grado_id: grado.id,
          anio_escolar_id: anioEscolar.id,
          nombre: 'A',
        },
      },
      update: {},
      create: { grado_id: grado.id, anio_escolar_id: anioEscolar.id, nombre: 'A' },
    });

    await prisma.aula.upsert({
      where: {
        grado_id_seccion_id_anio_escolar_id: {
          grado_id: grado.id,
          seccion_id: seccion.id,
          anio_escolar_id: anioEscolar.id,
        },
      },
      update: {},
      create: {
        grado_id: grado.id,
        seccion_id: seccion.id,
        anio_escolar_id: anioEscolar.id,
        turno: Turno.manana,
      },
    });

    // Un Usuario por rol, solo identidad — las columnas de credenciales no existen en este
    // change, así que no hay material de credenciales que pueda filtrarse (escenario `[R9b]`).
    const usuariosPorRol = [
      { rol: RolUsuario.estudiante, codigo: 'seed-estudiante', dni: '00000001', correo: 'seed.estudiante@seei.local', nombres: 'Estudiante Semilla' },
      { rol: RolUsuario.docente, codigo: 'seed-docente', dni: '00000002', correo: 'seed.docente@seei.local', nombres: 'Docente Semilla' },
      { rol: RolUsuario.comite, codigo: 'seed-comite', dni: '00000003', correo: 'seed.comite@seei.local', nombres: 'Comité Semilla' },
      { rol: RolUsuario.administrador, codigo: 'seed-administrador', dni: '00000004', correo: 'seed.administrador@seei.local', nombres: 'Administrador Semilla' },
      { rol: RolUsuario.director, codigo: 'seed-director', dni: '00000005', correo: 'seed.director@seei.local', nombres: 'Director Semilla' },
    ];

    for (const datosUsuario of usuariosPorRol) {
      await prisma.usuario.upsert({
        where: { codigo: datosUsuario.codigo },
        update: {},
        create: datosUsuario,
      });
    }

    // Singleton `Configuracion` (D7) — datos de marcador de posición, sin ninguna columna de
    // secreto SMTP. La contraseña SMTP vendrá de variable de entorno o gestor de secretos,
    // decisión de #10, nunca de una fila de esta tabla.
    await prisma.configuracion.upsert({
      where: { clave: 'institucional' },
      update: {},
      create: {
        clave: 'institucional',
        anio_escolar_id: anioEscolar.id,
        smtp_host: 'smtp.seei.local',
        smtp_puerto: 587,
        smtp_remitente: 'no-responder@seei.local',
      },
    });

    console.log('Seed estructural (identidad, árbol académico y configuración) aplicado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
