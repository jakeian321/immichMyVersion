// import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
// import { ApiTags } from '@nestjs/swagger';
// import {
//   AddUsersDto,
//   AlbumInfoDto,
//   AlbumResponseDto,
//   AlbumStatisticsResponseDto,
//   CreateAlbumDto,
//   GetAlbumsDto,
//   UpdateAlbumDto,
//   UpdateAlbumUserDto,
// } from 'src/dtos/album.dto';
// import { BulkIdResponseDto, BulkIdsDto } from 'src/dtos/asset-ids.response.dto';
// import { AuthDto } from 'src/dtos/auth.dto';
// import { Permission } from 'src/enum';
// import { Auth, Authenticated } from 'src/middleware/auth.guard';
// import { AlbumService } from 'src/services/album.service';
// import { ParseMeUUIDPipe, UUIDParamDto } from 'src/validation';





// @ApiTags('Albums')
// @Controller('albums')
// export class AlbumController {
//   constructor(private service: AlbumService) {}

//   @Get()
//   @Authenticated({ permission: Permission.ALBUM_READ })
//   getAllAlbums(@Auth() auth: AuthDto, @Query() query: GetAlbumsDto): Promise<AlbumResponseDto[]> {
//     return this.service.getAll(auth, query);
//   }

//   @Post()
//   @Authenticated({ permission: Permission.ALBUM_CREATE })
//   createAlbum(@Auth() auth: AuthDto, @Body() dto: CreateAlbumDto): Promise<AlbumResponseDto> {
//     return this.service.create(auth, dto);
//   }

//   @Get('statistics')
//   @Authenticated({ permission: Permission.ALBUM_STATISTICS })
//   getAlbumStatistics(@Auth() auth: AuthDto): Promise<AlbumStatisticsResponseDto> {
//     return this.service.getStatistics(auth);
//   }

//   @Authenticated({ permission: Permission.ALBUM_READ, sharedLink: true })
//   @Get(':id')
//   getAlbumInfo(
//     @Auth() auth: AuthDto,
//     @Param() { id }: UUIDParamDto,
//     @Query() dto: AlbumInfoDto,
//   ): Promise<AlbumResponseDto> {
//     return this.service.get(auth, id, dto);
//   }

//   @Patch(':id')
//   @Authenticated({ permission: Permission.ALBUM_UPDATE })
//   updateAlbumInfo(
//     @Auth() auth: AuthDto,
//     @Param() { id }: UUIDParamDto,
//     @Body() dto: UpdateAlbumDto,
//   ): Promise<AlbumResponseDto> {
//     return this.service.update(auth, id, dto);
//   }

//   @Delete(':id')
//   @Authenticated({ permission: Permission.ALBUM_DELETE })
//   deleteAlbum(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
//     return this.service.delete(auth, id);
//   }

//   @Put(':id/assets')
//   @Authenticated({ sharedLink: true })
//   addAssetsToAlbum(
//     @Auth() auth: AuthDto,
//     @Param() { id }: UUIDParamDto,
//     @Body() dto: BulkIdsDto,
//   ): Promise<BulkIdResponseDto[]> {
//     return this.service.addAssets(auth, id, dto);
//   }

//   @Delete(':id/assets')
//   @Authenticated()
//   removeAssetFromAlbum(
//     @Auth() auth: AuthDto,
//     @Body() dto: BulkIdsDto,
//     @Param() { id }: UUIDParamDto,
//   ): Promise<BulkIdResponseDto[]> {
//     return this.service.removeAssets(auth, id, dto);
//   }

//   @Put(':id/users')
//   @Authenticated()
//   addUsersToAlbum(
//     @Auth() auth: AuthDto,
//     @Param() { id }: UUIDParamDto,
//     @Body() dto: AddUsersDto,
//   ): Promise<AlbumResponseDto> {
//     return this.service.addUsers(auth, id, dto);
//   }

//   @Put(':id/user/:userId')
//   @Authenticated()
//   updateAlbumUser(
//     @Auth() auth: AuthDto,
//     @Param() { id }: UUIDParamDto,
//     @Param('userId', new ParseMeUUIDPipe({ version: '4' })) userId: string,
//     @Body() dto: UpdateAlbumUserDto,
//   ): Promise<void> {
//     return this.service.updateUser(auth, id, userId, dto);
//   }

//   @Delete(':id/user/:userId')
//   @Authenticated()
//   removeUserFromAlbum(
//     @Auth() auth: AuthDto,
//     @Param() { id }: UUIDParamDto,
//     @Param('userId', new ParseMeUUIDPipe({ version: '4' })) userId: string,
//   ) {
//     return this.service.removeUser(auth, id, userId);
//   }
// }



import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AddUsersDto,
  AlbumInfoDto,
  AlbumResponseDto,
  AlbumStatisticsResponseDto,
  CreateAlbumDto,
  GetAlbumsDto,
  UpdateAlbumDto,
  UpdateAlbumUserDto,
} from 'src/dtos/album.dto';
import { BulkIdResponseDto, BulkIdsDto } from 'src/dtos/asset-ids.response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { AlbumService } from 'src/services/album.service';
import { ParseMeUUIDPipe, UUIDParamDto } from 'src/validation';
import { AssetResponseDto } from 'src/dtos/asset-response.dto';
import { AssetOrder } from 'src/enum/asset-order.enum';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

// Define DTO for album assets filtering
export class GetAlbumAssetsDto {
  @IsOptional()
  @IsEnum(AssetOrder)
  order?: AssetOrder;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  tagIds?: string[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFavorite?: boolean;

  // Add other filter parameters as needed
}

@ApiTags('Albums')
@Controller('albums')
export class AlbumController {
  constructor(private service: AlbumService) {}

  @Get()
  @Authenticated({ permission: Permission.ALBUM_READ })
  getAllAlbums(@Auth() auth: AuthDto, @Query() query: GetAlbumsDto): Promise<AlbumResponseDto[]> {
    return this.service.getAll(auth, query);
  }

  @Post()
  @Authenticated({ permission: Permission.ALBUM_CREATE })
  createAlbum(@Auth() auth: AuthDto, @Body() dto: CreateAlbumDto): Promise<AlbumResponseDto> {
    return this.service.create(auth, dto);
  }

  @Get('statistics')
  @Authenticated({ permission: Permission.ALBUM_STATISTICS })
  getAlbumStatistics(@Auth() auth: AuthDto): Promise<AlbumStatisticsResponseDto> {
    return this.service.getStatistics(auth);
  }

  @Authenticated({ permission: Permission.ALBUM_READ, sharedLink: true })
  @Get(':id')
  getAlbumInfo(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Query() dto: AlbumInfoDto,
  ): Promise<AlbumResponseDto> {
    return this.service.get(auth, id, dto);
  }

  // Add new endpoint for getting album assets with filters
  @Get(':id/assets')
  @Authenticated({ permission: Permission.ALBUM_READ, sharedLink: true })
  getAlbumAssets(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Query() filters: GetAlbumAssetsDto,
  ): Promise<AssetResponseDto[]> {
    console.log("Album assets request with filters:", JSON.stringify(filters));
    return this.service.getAlbumAssets(auth, id, filters);
  }

  @Patch(':id')
  @Authenticated({ permission: Permission.ALBUM_UPDATE })
  updateAlbumInfo(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: UpdateAlbumDto,
  ): Promise<AlbumResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  @Authenticated({ permission: Permission.ALBUM_DELETE })
  deleteAlbum(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.delete(auth, id);
  }

  @Put(':id/assets')
  @Authenticated({ sharedLink: true })
  addAssetsToAlbum(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: BulkIdsDto,
  ): Promise<BulkIdResponseDto[]> {
    return this.service.addAssets(auth, id, dto);
  }

  @Delete(':id/assets')
  @Authenticated()
  removeAssetFromAlbum(
    @Auth() auth: AuthDto,
    @Body() dto: BulkIdsDto,
    @Param() { id }: UUIDParamDto,
  ): Promise<BulkIdResponseDto[]> {
    return this.service.removeAssets(auth, id, dto);
  }

  @Put(':id/users')
  @Authenticated()
  addUsersToAlbum(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AddUsersDto,
  ): Promise<AlbumResponseDto> {
    return this.service.addUsers(auth, id, dto);
  }

  @Put(':id/user/:userId')
  @Authenticated()
  updateAlbumUser(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Param('userId', new ParseMeUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: UpdateAlbumUserDto,
  ): Promise<void> {
    return this.service.updateUser(auth, id, userId, dto);
  }

  @Delete(':id/user/:userId')
  @Authenticated()
  removeUserFromAlbum(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Param('userId', new ParseMeUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.service.removeUser(auth, id, userId);
  }
}