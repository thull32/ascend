//! Community: threaded discussions attached to any content item (lesson or
//! problem). Soft-delete keeps thread structure intact when a parent is removed.
use sea_orm_migration::prelude::*;

use crate::m0001_identity::Users;
use crate::timestamps;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            timestamps(
                Table::create()
                    .table(Comments::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Comments::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Comments::UserId).uuid().not_null())
                    .col(ColumnDef::new(Comments::TargetKind).string_len(16).not_null())
                    .col(ColumnDef::new(Comments::TargetSlug).string_len(200).not_null())
                    .col(ColumnDef::new(Comments::ParentId).uuid().null())
                    .col(ColumnDef::new(Comments::Body).text().not_null())
                    .col(ColumnDef::new(Comments::DeletedAt).timestamp_with_time_zone().null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Comments::Table, Comments::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Comments::Table, Comments::ParentId)
                            .to(Comments::Table, Comments::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    ),
            )
            .to_owned(),
        )
        .await?;
        // Query pattern: "all comments on target X, oldest first".
        m.create_index(
            Index::create()
                .name("idx_comments_target")
                .table(Comments::Table)
                .col(Comments::TargetKind)
                .col(Comments::TargetSlug)
                .col(crate::Common::CreatedAt)
                .to_owned(),
        )
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.drop_table(Table::drop().table(Comments::Table).to_owned()).await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
pub enum Comments {
    Table,
    Id,
    UserId,
    TargetKind,
    TargetSlug,
    ParentId,
    Body,
    DeletedAt,
}
