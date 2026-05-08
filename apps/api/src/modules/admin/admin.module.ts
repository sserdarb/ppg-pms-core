import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantProvisioningController } from './tenant-provisioning.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ServiceTokenGuard } from './service-token.guard';

@Module({
  imports: [ConfigModule],
  controllers: [TenantProvisioningController],
  providers: [TenantProvisioningService, ServiceTokenGuard],
})
export class AdminModule {}
