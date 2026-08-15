import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthGuard } from './auth.guard';
import { JwtVerifierService } from './jwt-verifier.service';

@Module({
  providers: [JwtVerifierService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [JwtVerifierService],
})
export class AuthModule {}
