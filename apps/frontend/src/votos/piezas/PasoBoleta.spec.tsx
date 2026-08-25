import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoBoleta } from './PasoBoleta';
import type { Seleccion } from './PasoBoleta';
import type { PapeletaOpcionDto } from '../votos-api';

// [design.md D6; spec vote-casting: "Variantes de tarjeta del Paso 2 según tipo de proceso";
// tasks.md 17.1-17.6] Reescritura completa: la variante de tarjeta se elige por `tipo` de proceso,
// nunca por heurística sobre los campos presentes. `TarjetaVotoBlanco` es siempre una tarjeta
// adicional. La invariante crítica de `Seleccion` (D6): el `id` es siempre `opcion.id`, NUNCA
// `candidato_id` — usarlo rompería `campoEleccion('municipio')` en `VotacionPage`.
const OPCIONES_MUNICIPIO: PapeletaOpcionDto[] = [
  {
    id: 'l1',
    etiqueta: 'Lista A',
    simbolo: 'Sol',
    lema: 'Juntos',
    propuesta: 'Más recreos',
    plan_trabajo_presente: true,
    candidato_id: 'c1',
    candidato_nombres: 'Ana Pérez',
    cargo: 'Presidenta',
    foto_presente: true,
  },
];

const OPCIONES_CANDIDATO: PapeletaOpcionDto[] = [
  { id: 'c1', etiqueta: 'Ana Pérez', cargo: 'Delegada', candidato_id: 'c1', foto_presente: true },
];

const OPCIONES_CONSULTA: PapeletaOpcionDto[] = [
  { id: 'oc1', etiqueta: 'Sí', descripcion: 'A favor de la propuesta' },
];

describe('PasoBoleta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('[17.1] tipo=municipio renderiza TarjetaLista, con "Ver Propuesta Completa" solo si plan_trabajo_presente', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByText('Lista A')).toBeInTheDocument();
    expect(screen.getByText('Sol')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver propuesta completa/i })).toBeInTheDocument();
  });

  it('[17.1] tipo=representante_aula renderiza TarjetaCandidato, sin botón de propuesta', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_CANDIDATO}
        tipo="representante_aula"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByText('Delegada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ver propuesta completa/i })).not.toBeInTheDocument();
  });

  it('[17.1] tipo=consulta renderiza TarjetaOpcion, sin foto', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_CONSULTA}
        tipo="consulta"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByText('A favor de la propuesta')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('[17.2] TarjetaVotoBlanco presente como tarjeta adicional, nunca preseleccionada', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    const blanco = screen.getByRole('radio', { name: /votar en blanco/i });
    expect(blanco).not.toBeChecked();
  });

  it('[14.1] monta BannerInstrucciones entre el título y el radiogroup', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByText('Instrucciones de Votación')).toBeInTheDocument();
  });

  it('[14.1] el banner no bloquea la interacción con las tarjetas ni con "Siguiente Paso"', () => {
    const onSeleccionar = vi.fn();
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={{ tipo: 'blanco' }}
        onSeleccionar={onSeleccionar}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    expect(onSeleccionar).toHaveBeenCalledWith({ tipo: 'opcion', id: 'l1' } satisfies Seleccion);
    expect(screen.getByRole('button', { name: /siguiente paso/i })).not.toBeDisabled();
  });

  it('[14.4] la grilla de opciones usa grid gap-4 md:grid-cols-3', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByRole('radiogroup')).toHaveClass('grid', 'gap-4', 'md:grid-cols-3');
  });

  it('[17.3] preserva role="radiogroup" aria-label="Opciones de la boleta"', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: /opciones de la boleta/i })).toBeInTheDocument();
  });

  it('[17.4] click en TarjetaLista notifica onSeleccionar con opcion.id, nunca candidato_id', () => {
    const onSeleccionar = vi.fn();
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={onSeleccionar}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));

    expect(onSeleccionar).toHaveBeenCalledWith({ tipo: 'opcion', id: 'l1' } satisfies Seleccion);
  });

  it('[17.5] click en "Ver Propuesta Completa" no dispara onSeleccionar (no cambia la Seleccion)', () => {
    const onSeleccionar = vi.fn();
    vi.stubGlobal('open', vi.fn());
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={onSeleccionar}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ver propuesta completa/i }));

    expect(onSeleccionar).not.toHaveBeenCalled();
  });

  it('[17.6] monta BarraProgresoVotacion con pasoActual=2 y "% Completado"', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText(/% completado/i)).toBeInTheDocument();
  });

  it('[17.6] footer: "Siguiente Paso" deshabilitado sin selección, habilitado con selección', () => {
    const { rerender } = render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /siguiente paso/i })).toBeDisabled();

    rerender(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={{ tipo: 'blanco' }}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /siguiente paso/i })).not.toBeDisabled();
  });

  it('[17.6] "Volver al paso anterior" invoca onVolver', () => {
    const onVolver = vi.fn();
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={onVolver}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /volver al paso anterior/i }));
    expect(onVolver).toHaveBeenCalledTimes(1);
  });

  it('[21.1] "Ver Propuesta Completa" nunca puede recibir el foco de la navegación de flechas del radiogroup: no comparte name="eleccion" ni type="radio" con el grupo', () => {
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={undefined}
        onSeleccionar={vi.fn()}
        onContinuar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    const boton = screen.getByRole('button', { name: /ver propuesta completa/i });
    expect(boton.tagName).toBe('BUTTON');
    expect(boton).not.toHaveAttribute('name', 'eleccion');

    // La navegación de flechas del radiogroup nativo del navegador solo recorre elementos
    // type="radio" que comparten el mismo name — "Ver Propuesta Completa" no es uno de ellos, así
    // que queda estructuralmente fuera de esa navegación (design.md D1; spec vote-casting:
    // "Ver Propuesta Completa" no interfiere con la navegación de flechas del grupo).
    const radios = screen.getAllByRole('radio');
    expect(radios.every((radio) => radio.getAttribute('name') === 'eleccion')).toBe(true);
    expect(radios).not.toContain(boton);
  });

  it('[17.6] "Siguiente Paso" con selección invoca onContinuar', () => {
    const onContinuar = vi.fn();
    render(
      <PasoBoleta
        opciones={OPCIONES_MUNICIPIO}
        tipo="municipio"
        derechoVotoId="dv1"
        seleccion={{ tipo: 'blanco' }}
        onSeleccionar={vi.fn()}
        onContinuar={onContinuar}
        onVolver={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));
    expect(onContinuar).toHaveBeenCalledTimes(1);
  });
});
