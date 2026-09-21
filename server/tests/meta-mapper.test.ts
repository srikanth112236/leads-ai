import { mapMetaLeadToIngest } from '../src/modules/meta/meta-lead.mapper';

describe('meta lead mapper (§19)', () => {
  test('standard field_data maps to normalized fields', () => {
    const mapped = mapMetaLeadToIngest({
      id: '123',
      created_time: '2026-01-01T00:00:00+0000',
      ad_id: 'ad-1',
      form_id: 'form-1',
      field_data: [
        { name: 'full_name', values: ['Joe Example'] },
        { name: 'email', values: ['joe@example.com'] },
        { name: 'phone_number', values: ['+919876543210'] },
      ],
    });
    expect(mapped.name).toBe('Joe Example');
    expect(mapped.email).toBe('joe@example.com');
    expect(mapped.phone).toBe('+919876543210');
    expect(mapped.meta.leadgenId).toBe('123');
    expect(mapped.meta.ad_id).toBe('ad-1');
  });

  test('variant and split names resolve', () => {
    const mapped = mapMetaLeadToIngest({
      id: '124',
      field_data: [
        { name: 'first_name', values: ['Asha'] },
        { name: 'last_name', values: ['Verma'] },
        { name: 'mobile', values: ['9876543210'] },
        { name: 'email_address', values: ['asha@example.com'] },
      ],
    });
    expect(mapped.name).toBe('Asha Verma');
    expect(mapped.phone).toBe('9876543210');
    expect(mapped.email).toBe('asha@example.com');
  });

  test('custom fields preserved, unknown shapes never throw', () => {
    const mapped = mapMetaLeadToIngest({
      id: '125',
      field_data: [
        { name: 'car_make', values: ['Honda'] },
        { name: 'weird', values: [] },
        { name: 'x', values: [null] },
      ],
    });
    expect(mapped.name).toBeUndefined();
    expect((mapped.meta.customFields as Record<string, unknown>).car_make).toBe('Honda');
    expect(mapMetaLeadToIngest({}).name).toBeUndefined();
    expect(mapMetaLeadToIngest({ field_data: 'nope' }).email).toBeUndefined();
  });
});
