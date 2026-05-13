package model

import (
	"time"

	"gorm.io/gorm"
)

// WebDesktopCredential stores encrypted remote desktop password material for a
// proxy. Passwords are encrypted by the manager before persistence.
type WebDesktopCredential struct {
	gorm.Model
	ProxyID           uint       `gorm:"column:proxy_id;type:int;not null;uniqueIndex:idx_webdesktop_credentials_proxy_user_protocol_identity"`
	UserID            uint       `gorm:"column:user_id;type:int;not null;index;uniqueIndex:idx_webdesktop_credentials_proxy_user_protocol_identity"`
	Protocol          string     `gorm:"column:protocol;type:varchar(32);not null;uniqueIndex:idx_webdesktop_credentials_proxy_user_protocol_identity"`
	Username          string     `gorm:"column:username;type:varchar(255);not null;default:'';uniqueIndex:idx_webdesktop_credentials_proxy_user_protocol_identity"`
	Domain            string     `gorm:"column:domain;type:varchar(255);not null;default:'';uniqueIndex:idx_webdesktop_credentials_proxy_user_protocol_identity"`
	EncryptedPassword string     `gorm:"column:encrypted_password;type:text;not null"`
	Nonce             string     `gorm:"column:nonce;type:varchar(128);not null"`
	LastUsedAt        *time.Time `gorm:"column:last_used_at;type:datetime"`
}

func (WebDesktopCredential) TableName() string {
	return "webdesktop_credentials"
}
