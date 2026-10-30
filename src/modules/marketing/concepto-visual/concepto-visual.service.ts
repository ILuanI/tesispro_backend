import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConceptoVisual } from '../../../entities/concepto-visual.entity.js';

@Injectable()
export class ConceptoVisualService {
  constructor(
    @InjectRepository(ConceptoVisual)
    private readonly repository: Repository<ConceptoVisual>,
  ) {}

  findAll(): Promise<ConceptoVisual[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<ConceptoVisual> {
    const entity = await this.repository.findOne({
      where: { idConcepto: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`ConceptoVisual con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<ConceptoVisual>): Promise<ConceptoVisual> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<ConceptoVisual>): Promise<ConceptoVisual> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idConcepto: id } as never);
  }
}
