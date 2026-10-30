import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EtapaTesis } from '../../../entities/etapa-tesis.entity.js';

@Injectable()
export class EtapaTesisService {
  constructor(
    @InjectRepository(EtapaTesis)
    private readonly repository: Repository<EtapaTesis>,
  ) {}

  findAll(): Promise<EtapaTesis[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<EtapaTesis> {
    const entity = await this.repository.findOne({
      where: { idEtapa: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`EtapaTesis con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<EtapaTesis>): Promise<EtapaTesis> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<EtapaTesis>): Promise<EtapaTesis> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idEtapa: id } as never);
  }
}
