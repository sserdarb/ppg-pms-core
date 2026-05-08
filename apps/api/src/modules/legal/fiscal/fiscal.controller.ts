import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceTokenGuard } from '../../admin/service-token.guard';
import { FiscalService } from './fiscal.service';
import { IssueInvoiceDto } from './dto/issue-invoice.dto';

@ApiTags('legal-fiscal')
@ApiBearerAuth()
@UseGuards(ServiceTokenGuard)
@Controller('admin/fiscal')
export class FiscalController {
  constructor(private readonly svc: FiscalService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List registered fiscal providers and whether each is configured' })
  list() {
    return this.svc.listRegistered();
  }

  @Post('issue')
  @ApiOperation({ summary: 'Issue a fiscal invoice via the property\'s jurisdiction provider' })
  issue(@Body() dto: IssueInvoiceDto) {
    // DTO is structurally compatible with FiscalIssueRequest; TS can't see
    // through class-validator decorators, hence the cast.
    return this.svc.issue(dto as unknown as Parameters<typeof this.svc.issue>[0]);
  }

  @Post(':propertyId/void/:documentId')
  @ApiOperation({ summary: 'Void a previously issued fiscal document' })
  voidInvoice(@Param('propertyId') propertyId: string, @Param('documentId') documentId: string) {
    return this.svc.voidInvoice(propertyId, documentId);
  }

  @Get(':propertyId/status/:documentId')
  @ApiOperation({ summary: 'Get the integrator\'s current status for a document' })
  status(@Param('propertyId') propertyId: string, @Param('documentId') documentId: string) {
    return this.svc.getStatus(propertyId, documentId);
  }
}
