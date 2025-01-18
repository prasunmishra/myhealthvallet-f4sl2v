import React, { memo, useState, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Theme } from '../../styles/theme';
import { SPACING, BREAKPOINTS } from '../../styles/dimensions';
import LoadingSpinner from './LoadingSpinner';

// Interfaces
interface Column {
  id: string;
  header: string;
  accessor: string;
  sortable?: boolean;
  width?: string | number;
  cell?: (value: any) => React.ReactNode;
  ariaLabel?: string;
  headerProps?: Record<string, any>;
  cellProps?: Record<string, any>;
}

interface TableProps {
  data: Array<any>;
  columns: Array<Column>;
  loading?: boolean;
  sortable?: boolean;
  pagination?: boolean;
  pageSize?: number;
  onSort?: (columnId: string, direction: 'asc' | 'desc') => void;
  onPageChange?: (page: number) => void;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  virtualScroll?: boolean;
  rowHeight?: number;
  onRowClick?: (row: any) => void;
  selectedRows?: Array<string>;
  emptyStateMessage?: string;
  loadingMessage?: string;
}

// Styled Components
const TableContainer = styled.div`
  width: 100%;
  overflow-x: auto;
  background: ${({ theme }: { theme: Theme }) => theme.colors.surface[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadows.sm};

  @media (max-width: ${BREAKPOINTS.MOBILE}px) {
    border-radius: 0;
  }
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: ${({ theme }: { theme: Theme }) => theme.colors.text[500]};
`;

const TableHeader = styled.th<{ sortable?: boolean; width?: string | number }>`
  padding: ${SPACING.MEDIUM}px;
  text-align: left;
  font-weight: ${({ theme }) => theme.typography.fontWeights.semibold};
  background: ${({ theme }) => theme.colors.surface[200]};
  border-bottom: 2px solid ${({ theme }) => theme.colors.surface[300]};
  width: ${({ width }) => (width ? (typeof width === 'number' ? `${width}px` : width) : 'auto')};
  white-space: nowrap;
  cursor: ${({ sortable }) => (sortable ? 'pointer' : 'default')};
  transition: background-color 0.2s ease;

  &:hover {
    background: ${({ theme, sortable }) =>
      sortable ? theme.colors.surface[300] : theme.colors.surface[200]};
  }

  &:first-child {
    border-top-left-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  }

  &:last-child {
    border-top-right-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  }
`;

const TableRow = styled.tr<{ clickable?: boolean; selected?: boolean }>`
  &:nth-child(even) {
    background: ${({ theme }) => theme.colors.surface[100]};
  }

  &:nth-child(odd) {
    background: ${({ theme }) => theme.colors.surface[200]};
  }

  ${({ clickable, theme }) =>
    clickable &&
    `
    cursor: pointer;
    &:hover {
      background: ${theme.colors.surface[300]};
    }
  `}

  ${({ selected, theme }) =>
    selected &&
    `
    background: ${theme.colors.primary[100]} !important;
  `}
`;

const TableCell = styled.td`
  padding: ${SPACING.MEDIUM}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface[300]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EmptyState = styled.div`
  padding: ${SPACING.XLARGE}px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text[300]};
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${SPACING.XLARGE}px;
`;

const SortIcon = styled.span<{ direction?: 'asc' | 'desc' }>`
  margin-left: ${SPACING.SMALL}px;
  opacity: ${({ direction }) => (direction ? 1 : 0.3)};
  &::after {
    content: '${({ direction }) => (direction === 'asc' ? '↑' : '↓')}';
  }
`;

// Custom Hooks
const useTableSort = (initialSort?: { columnId: string; direction: 'asc' | 'desc' }) => {
  const [sortState, setSortState] = useState(initialSort);

  const handleSort = useCallback(
    (columnId: string) => {
      const newDirection =
        sortState?.columnId === columnId
          ? sortState.direction === 'asc'
            ? 'desc'
            : 'asc'
          : 'asc';
      setSortState({ columnId, direction: newDirection });
      return { columnId, direction: newDirection };
    },
    [sortState]
  );

  return { sortState, handleSort };
};

// Main Component
const Table: React.FC<TableProps> = memo(({
  data,
  columns,
  loading = false,
  sortable = true,
  pagination = false,
  pageSize = 10,
  onSort,
  onPageChange,
  className,
  testId = 'data-table',
  ariaLabel = 'Data Table',
  virtualScroll = false,
  rowHeight,
  onRowClick,
  selectedRows = [],
  emptyStateMessage = 'No data available',
  loadingMessage = 'Loading data...'
}) => {
  const { sortState, handleSort } = useTableSort();

  const handleHeaderClick = useCallback(
    (column: Column) => {
      if (sortable && column.sortable) {
        const newSort = handleSort(column.id);
        onSort?.(newSort.columnId, newSort.direction);
      }
    },
    [sortable, handleSort, onSort]
  );

  const renderSortIcon = useCallback(
    (column: Column) => {
      if (!sortable || !column.sortable) return null;
      return (
        <SortIcon
          direction={sortState?.columnId === column.id ? sortState.direction : undefined}
          aria-hidden="true"
        />
      );
    },
    [sortable, sortState]
  );

  if (loading) {
    return (
      <TableContainer className={className}>
        <LoadingContainer>
          <LoadingSpinner size="large" />
          <span role="status">{loadingMessage}</span>
        </LoadingContainer>
      </TableContainer>
    );
  }

  if (!data.length) {
    return (
      <TableContainer className={className}>
        <EmptyState role="status">{emptyStateMessage}</EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer className={className} data-testid={testId}>
      <StyledTable role="table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => (
              <TableHeader
                key={column.id}
                onClick={() => handleHeaderClick(column)}
                sortable={sortable && column.sortable}
                width={column.width}
                role="columnheader"
                aria-sort={
                  sortState?.columnId === column.id
                    ? sortState.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                {...column.headerProps}
              >
                {column.header}
                {renderSortIcon(column)}
              </TableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <TableRow
              key={rowIndex}
              onClick={() => onRowClick?.(row)}
              clickable={!!onRowClick}
              selected={selectedRows.includes(row.id)}
              role="row"
            >
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  role="cell"
                  {...column.cellProps}
                >
                  {column.cell ? column.cell(row[column.accessor]) : row[column.accessor]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </tbody>
      </StyledTable>
    </TableContainer>
  );
});

Table.displayName = 'Table';

export default Table;