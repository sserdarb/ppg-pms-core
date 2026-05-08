import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ServiceTokenGuard } from './service-token.guard';
import { DeactivateTenantDto, ProvisionTenantDto } from './dto/provision-tenant.dto';

/**
 * PPG master panel ↔ PMS control plane.
 *
 * All endpoints require the PPG_SERVICE_TOKEN bearer (ServiceTokenGuard);
 * they are NOT user-facing and do not accept a PPG SSO JWT.
 */
@ApiTags('admin-tenants')
@ApiBearerAuth()
@UseGuards(ServiceTokenGuard)
@Controller('admin/tenants')
export class TenantProvisioningController {
  constructor(private readonly svc: TenantProvisioningService) {}

  @Post()
  @ApiOperation({
    summary: 'Provision (or re-sync) a tenant from the PPG master panel',
    description:
      'Idempotent on ppgPropertyId. Creates the property, applies the jurisdiction-default tax profile if applyDefaultTaxes !== false, and returns the PMS propertyId for subsequent calls.',
  })
  provision(@Body() dto: ProvisionTenantDto) {
    return this.svc.provision(dto);
  }

  @Patch(':externalId')
  @ApiOperation({ summary: 'Activate or deactivate a tenant' })
  setActive(@Param('externalId') externalId: string, @Body() dto: DeactivateTenantDto) {
    return this.svc.deactivate(externalId, dto.active);
  }

  @Get(':externalId')
  @ApiOperation({ summary: 'Look up a tenant by its PPG external id' })
  get(@Param('externalId') externalId: string) {
    return this.svc.getByExternalId(externalId);
  }
}
