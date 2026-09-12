import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderInput,transitions,normalizeSearch} from '../lib/commerce-contracts.ts';
const input={idempotency:'9b465c3d-4eef-4b7b-806b-f7e527c263bf',customerName:'Cliente Teste',email:'teste@example.com',phone:'11999999999',vehicle:'',note:'',items:[{productId:'filtro-ar',quantity:2}]};
test('checkout rejects client-supplied totals and tenant identity',()=>{assert.equal(orderInput.safeParse({...input,totalCents:1}).success,false);assert.equal(orderInput.safeParse({...input,store:'other'}).success,false);assert.equal(orderInput.safeParse({...input,owner:'other'}).success,false)});
test('checkout rejects duplicate lines, negative and fractional quantities',()=>{for(const items of [[...input.items,...input.items],[{productId:'x',quantity:-1}],[{productId:'x',quantity:1.5}]])assert.equal(orderInput.safeParse({...input,items}).success,false)});
test('valid order accepted and empty customer rejected',()=>{assert.equal(orderInput.safeParse(input).success,true);assert.equal(orderInput.safeParse({...input,customerName:''}).success,false)});
test('terminal orders cannot be changed and packing cannot skip to completed',()=>{assert.deepEqual(transitions.COMPLETED,[]);assert.deepEqual(transitions.CANCELLED,[]);assert.equal(transitions.PACKING.includes('COMPLETED'),false)});
test('search matches accent-insensitive names and codes',()=>{assert.equal(normalizeSearch('  Lâmpada H4 '),'lampada h4');assert.equal(normalizeSearch('9025.476'),'9025.476')});
