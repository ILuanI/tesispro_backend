import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConvenioInstitucional } from '../../../entities/convenio-institucional.entity.js';

@Injectable()
export class ConvenioInstitucionalService {
  constructor(
    @InjectRepository(ConvenioInstitucional)
    private readonly repository: Repository<ConvenioInstitucional>,
  ) {}

  findAll(): Promise<ConvenioInstitucional[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<ConvenioInstitucional> {
    const entity = await this.repository.findOne({
      where: { idConvenio: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`ConvenioInstitucional con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<ConvenioInstitucional>): Promise<ConvenioInstitucional> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<ConvenioInstitucional>): Promise<ConvenioInstitucional> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idConvenio: id } as never);
  }
}
