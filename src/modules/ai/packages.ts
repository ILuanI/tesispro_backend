import { z } from "zod";
export const publicPackageSchema = z.object({
  idServicio: z.number().int().positive(),
  codigo: z.string().max(30),
  nombre: z.string().max(150),
  descripcion: z.string().max(3000),
  publicoObjetivo: z.string().nullable(),
  guiaRecomendacion: z.string().max(16000).nullable().optional(),
  prestaciones: z.array(z.string().max(1000)).max(50).optional(),
  componentes: z
    .array(
      z.object({
        idServicio: z.number().int(),
        cantidad: z.number().int(),
        nombre: z.string(),
        codigo: z.string(),
      }),
    )
    .max(50),
  entregables: z.array(z.string().max(500)).max(30),
  restricciones: z.array(z.string().max(500)).max(30),
  precioFijo: z.string().regex(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/),
  moneda: z.enum(["PEN", "USD", "EUR"]),
  modalidad: z.enum(["virtual", "presencial", "hibrida"]),
  duracionDias: z.number().int().nullable(),
  vigenciaDesde: z.string().nullable(),
  vigenciaHasta: z.string().nullable(),
  version: z.number().int().positive(),
});
export type PublicPackage = z.infer<typeof publicPackageSchema>;
export interface NegotiationService {
  id: string;
  name: string;
  commercialDescription: string;
  minPrice: number;
  maxPrice: number;
  maxDiscount: number;
  unit: string;
  currency?: string;
  condition?: string;
  version?: number;
  code?: string;
  deliverables?: string[];
  restrictions?: string[];
  recommendationGuide?: string;
  benefits?: string[];
}
export function packageServices(
  packages: PublicPackage[],
): NegotiationService[] {
  return packages.map((p) => ({
    id: `paquete-${p.idServicio}`,
    name: p.nombre,
    code: p.codigo,
    version: p.version,
    commercialDescription: [
      p.descripcion,
      ...(p.publicoObjetivo ? [`Dirigido a: ${p.publicoObjetivo}`] : []),
      ...(p.prestaciones?.length ? [`Incluye: ${p.prestaciones.join('; ')}`] : []),
      `Servicios: ${p.componentes
        .map((c) => `${c.nombre} (${c.cantidad})`)
        .join(", ")}`,
      `Entregables: ${p.entregables.join("; ")}`,
      `Restricciones: ${p.restricciones.join("; ")}`,
      `Modalidad: ${p.modalidad}.${p.duracionDias ? ` Duración configurada: ${p.duracionDias} días.` : ""} Resumen sujeto al alcance completo del paquete.`,
    ].join("\n"),
    minPrice: Number(p.precioFijo),
    maxPrice: Number(p.precioFijo),
    maxDiscount: 0,
    unit: "por paquete",
    currency: p.moneda,
    deliverables: p.entregables,
    benefits: p.prestaciones || [],
    restrictions: p.restricciones,
    recommendationGuide: p.guiaRecomendacion || undefined,
    condition: `Modalidad ${p.modalidad}${p.duracionDias ? ` · ${p.duracionDias} días de acompañamiento` : ''}`,
  }));
}
