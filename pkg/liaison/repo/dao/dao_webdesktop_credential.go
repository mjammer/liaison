package dao

import (
	"errors"
	"strings"
	"time"

	"github.com/liaisonio/liaison/pkg/liaison/repo/model"
	"gorm.io/gorm"
)

func (d *dao) ListWebDesktopCredentialsByProxyAndUser(proxyID, userID uint, protocol string) ([]*model.WebDesktopCredential, error) {
	var credentials []*model.WebDesktopCredential
	db := d.getDB().Where("proxy_id = ? AND user_id = ?", proxyID, userID)
	if protocol != "" {
		db = db.Where("protocol = ?", protocol)
	}
	if err := db.
		Order("last_used_at IS NULL ASC").
		Order("last_used_at DESC").
		Order("updated_at DESC").
		Find(&credentials).Error; err != nil {
		return nil, err
	}
	return credentials, nil
}

func (d *dao) GetWebDesktopCredential(proxyID, userID uint, protocol, username, domain string) (*model.WebDesktopCredential, error) {
	var credential model.WebDesktopCredential
	if err := d.getDB().
		Where("proxy_id = ? AND user_id = ? AND protocol = ? AND username = ? AND domain = ?",
			proxyID, userID, protocol, username, domain).
		First(&credential).Error; err != nil {
		return nil, err
	}
	return &credential, nil
}

func (d *dao) UpsertWebDesktopCredential(credential *model.WebDesktopCredential) error {
	if credential == nil {
		return errors.New("webdesktop credential is nil")
	}
	var existing model.WebDesktopCredential
	err := d.getDB().
		Where("proxy_id = ? AND user_id = ? AND protocol = ? AND username = ? AND domain = ?",
			credential.ProxyID, credential.UserID, credential.Protocol, credential.Username, credential.Domain).
		First(&existing).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return d.getDB().Create(credential).Error
		}
		return err
	}
	existing.EncryptedPassword = credential.EncryptedPassword
	existing.Nonce = credential.Nonce
	return d.getDB().Save(&existing).Error
}

func (d *dao) TouchWebDesktopCredential(proxyID, userID uint, protocol, username, domain string) error {
	now := time.Now()
	return d.getDB().Model(&model.WebDesktopCredential{}).
		Where("proxy_id = ? AND user_id = ? AND protocol = ? AND username = ? AND domain = ?",
			proxyID, userID, protocol, username, domain).
		Update("last_used_at", &now).Error
}

func (d *dao) DeleteWebDesktopCredential(proxyID, userID uint, protocol, username, domain string) error {
	protocol = strings.TrimSpace(protocol)
	if protocol == "" {
		return errors.New("远程桌面协议不能为空")
	}
	return d.getDB().Unscoped().
		Where("proxy_id = ? AND user_id = ? AND protocol = ? AND username = ? AND domain = ?",
			proxyID, userID, protocol, username, domain).
		Delete(&model.WebDesktopCredential{}).Error
}

func (d *dao) DeleteWebDesktopCredentialByProxyID(proxyID uint) error {
	return d.getDB().Unscoped().Where("proxy_id = ?", proxyID).Delete(&model.WebDesktopCredential{}).Error
}
