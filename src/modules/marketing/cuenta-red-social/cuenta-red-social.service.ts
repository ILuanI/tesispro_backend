import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaRedSocial } from '../../../entities/cuenta-red-social.entity.js';

@Injectable()
export class CuentaRedSocialService {
  constructor(
    @InjectRepository(CuentaRedSocial)
    private readonly repository: Repository<CuentaRedSocial>,
  ) {}

  findAll(): Promise<CuentaRedSocial[]> {
    return this.repository.find();
  }

  async findOne(id: number | string): Promise<CuentaRedSocial> {
    const entity = await this.repository.findOne({
      where: { idCuenta: id } as never,
    });
    if (!entity) {
      throw new NotFoundException(`CuentaRedSocial con id ${id} no encontrado`);
    }
    return entity;
  }

  create(data: Partial<CuentaRedSocial>): Promise<CuentaRedSocial> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: number | string, data: Partial<CuentaRedSocial>): Promise<CuentaRedSocial> {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: number | string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete({ idCuenta: id } as never);
  }
}
