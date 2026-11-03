import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { Request, Response } from 'express';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { LoginDto } from './admin.dto.js';

const derive = promisify(scrypt);
export const Public = () => SetMetadata('adminPublic', true);
export const PaymentRoles = (...roles:string[]) => SetMetadata('paymentRoles', roles);
export interface AdminUser {
  idUsuario: number;
  nombres: string;
  apellidos: string;
  correo: string;
  rol: string;
}
export type AdminRequest = Request & { admin: AdminUser };
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const sessionToken = (req: Request) =>
  (req.headers.cookie || '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('tesispro_session='))
    ?.slice(17) || '';

export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password: string, hash: string | null) {
  const parts = (hash || '').split(':');
  const valid =
    parts.length === 3 &&
    parts[0] === 'scrypt' &&
    /^[a-f0-9]{32}$/.test(parts[1]) &&
    /^[a-f0-9]{128}$/.test(parts[2]);
  const key = (await derive(
    password,
    valid ? parts[1] : '0'.repeat(32),
    64,
  )) as Buffer;
  return valid && timingSafeEqual(key, Buffer.from(parts[2], 'hex'));
}

@Injectable()
export class AuthService {
  private attempts = new Map<string, { count: number; expires: number }>();
  constructor(private readonly db: DataSource) {}
  checkOrigin(req: Request) {
    const origin = process.env.APP_ORIGIN || 'http://localhost:4321';
    if (req.headers.origin !== origin)
      throw new ForbiddenException('Origen de solicitud no permitido.');
  }
  async login(dto: LoginDto, req: Request, res: Response) {
    this.checkOrigin(req);
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.expires < now) this.attempts.delete(key);
    const key = req.ip || 'unknown';
    const attempt = this.attempts.get(key) || {
      count: 0,
      expires: now + 15 * 60_000,
    };
    if (attempt.count >= 10 || this.attempts.size > 10_000)
      throw new ForbiddenException(
        'Demasiados intentos. Intenta nuevamente en 15 minutos.',
      );
    attempt.count++;
    this.attempts.set(key, attempt);
    const [row] = await this.db.query(
      'SELECT * FROM usuario_interno WHERE lower(correo)=$1',
      [dto.correo.trim().toLowerCase()],
    );
    const matches = await passwordMatches(
      dto.password,
      row?.password_hash || null,
    );
    if (!matches || !row.activo || !['administrador','asesor_comercial'].includes(row.rol))
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    const token = randomBytes(32).toString('hex');
    await this.db.transaction(async (manager) => {
      await manager.query(
        'DELETE FROM sesion_admin WHERE expires_at < now() OR token_hash=$1',
        [digest(sessionToken(req))],
      );
      await manager.query(
        "INSERT INTO sesion_admin(token_hash,id_usuario,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [digest(token), row.id_usuario],
      );
    });
    this.attempts.delete(key);
    res.cookie('tesispro_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60_000,
    });
    res.setHeader('Cache-Control', 'no-store');
    return this.user(row);
  }
  private user(row: Record<string, any>): AdminUser {
    return {
      idUsuario: row.id_usuario,
      nombres: row.nombres,
      apellidos: row.apellidos,
      correo: row.correo,
      rol: row.rol,
    };
  }
  async authenticate(req: Request): Promise<AdminUser> {
    const token = sessionToken(req);
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Inicia sesión para continuar.');
    const [row] = await this.db.query(
      `SELECT u.* FROM sesion_admin s JOIN usuario_interno u USING(id_usuario)
      WHERE token_hash=$1 AND expires_at>now() AND u.activo=true AND u.rol IN ('administrador','asesor_comercial')`,
      [digest(token)],
    );
    if (!row)
      throw new UnauthorizedException(
        'Tu sesión expiró. Inicia sesión nuevamente.',
      );
    return this.user(row);
  }
  async logout(req: Request, res: Response) {
    await this.db.query('DELETE FROM sesion_admin WHERE token_hash=$1', [
      digest(sessionToken(req)),
    ]);
    res.clearCookie('tesispro_session', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return { ok: true };
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.path === '/') return true;
    if (
      this.reflector.getAllAndOverride('adminPublic', [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    req.admin = await this.auth.authenticate(req);
    const roles=this.reflector.getAllAndOverride<string[]>('paymentRoles',[ctx.getHandler(),ctx.getClass()])??['administrador'];
    if(!roles.includes(req.admin.rol)) throw new ForbiddenException('Tu rol no tiene acceso a esta operación.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      this.auth.checkOrigin(req);
      const resource = req.path.split('/')[1];
      if (
        [
          'perfil-academico','perfil-laboral','proyecto-tesis','proyecto-necesidad','conversacion','mensaje','seguimiento','sesion-landing','descarga-recurso','derivacion-humana',
          'lead',
          'lead-estado-historial',
          'pago', 'pago-evento', 'pago-comprobante', 'pago-rectificacion', 'cronograma-pago', 'cuota-pago', 'cronograma-version', 'modalidad-pago', 'cuota-entrega', 'cronograma-evento',
          'contrato',
          'propuesta',
          'propuesta-detalle',
          'cliente',
          'usuario-interno',
          'estado-lead',
          'recurso-gratuito',
          'enlace-referido',
        ].includes(resource)
      ) {
        throw new ForbiddenException(
          'Utiliza las operaciones administrativas para modificar este recurso.',
        );
      }
    }
    return true;
  }
}

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(dto, req, res);
  }
  @Post('logout')
  @PaymentRoles('administrador','asesor_comercial')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
  @Get('me') @PaymentRoles('administrador','asesor_comercial') me(@Req() req: AdminRequest) {
    return req.admin;
  }
}
